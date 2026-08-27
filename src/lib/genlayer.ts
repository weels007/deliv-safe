import { createClient } from "genlayer-js";
import { localnet, studionet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";

type NetworkName = "localnet" | "studionet";

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
    };
  }
}

const network = (process.env.NEXT_PUBLIC_NETWORK as NetworkName) || "studionet";
const endpoint = process.env.NEXT_PUBLIC_GENLAYER_RPC;
const chainMap = { localnet, studionet };
const explorerBase = process.env.NEXT_PUBLIC_EXPLORER_BASE || "https://explorer-studio.genlayer.com/address/";

const storageKey = "deliveryescrow.contract";

type RuntimeClient = {
  connect?: (name: NetworkName) => Promise<unknown>;
  readContract: (args: { address: string; functionName: string; args: unknown[] }) => Promise<unknown>;
  writeContract: (args: { address: string; functionName: string; args: unknown[]; value: bigint }) => Promise<string | { txId: string }>;
  waitForTransactionReceipt: (args: { hash: `0x${string}`; status: string; interval?: number; retries?: number }) => Promise<Record<string, unknown>>;
  getTransaction: (args: { hash: `0x${string}` }) => Promise<Record<string, unknown>>;
};

export type ContractResult = {
  success: boolean;
  pending?: boolean;
  data?: unknown;
  hash?: string;
  status?: string;
  error?: string;
};

type RuntimeFailure = { kind: string; payload: string };

function findRuntimeFailure(value: unknown, seen = new Set<unknown>()): RuntimeFailure | null {
  if (!value || typeof value !== "object" || seen.has(value)) return null;
  seen.add(value);
  const record = value as Record<string, unknown>;
  const status = String(record.status ?? record.execution_result ?? record.txExecutionResultName ?? "").toUpperCase();
  if (["ROLLBACK", "CONTRACT_ERROR", "ERROR", "FAILED", "FINISHED_WITH_ERROR"].some(marker => status.includes(marker))) {
    const raw = record.payload ?? record.error_description ?? record.raw_error ?? record.message ?? status;
    return { kind: status || "CONTRACT_ERROR", payload: typeof raw === "string" ? raw : JSON.stringify(raw) };
  }
  for (const nested of Object.values(record)) {
    const failure = findRuntimeFailure(nested, seen);
    if (failure) return failure;
  }
  return null;
}

export function address(): string {
  if (typeof window === "undefined") return process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "";
  return localStorage.getItem(storageKey) || process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "";
}

export function setAddress(value: string) {
  localStorage.setItem(storageKey, value.trim());
}

export function explorerUrl(): string {
  return `${explorerBase}${address()}`;
}

export async function connectWallet(): Promise<ContractResult> {
  if (!window.ethereum) return { success: false, error: "Install or unlock an EVM wallet first." };
  try {
    const accounts = (await window.ethereum.request({ method: "eth_requestAccounts" })) as string[];
    return accounts[0]
      ? { success: true, data: accounts[0] }
      : { success: false, error: "No account selected." };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Wallet connection failed." };
  }
}

const readClient = createClient({
  chain: chainMap[network] ?? studionet,
  ...(endpoint ? { endpoint } : {}),
});

export async function readContract(functionName: string, args: unknown[] = []): Promise<ContractResult> {
  const addr = address();
  if (!addr || addr.endsWith("0".repeat(40))) {
    return { success: false, error: "Configure a deployed contract address first." };
  }
  try {
    const data = await (readClient as unknown as RuntimeClient).readContract({ address: addr, functionName, args });
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Contract read failed." };
  }
}

export async function writeContract(
  functionName: string,
  args: unknown[],
  value = BigInt(0)
): Promise<ContractResult> {
  if (!window.ethereum) return { success: false, error: "Connect a wallet before writing." };
  const addr = address();
  if (!addr || addr.endsWith("0".repeat(40))) {
    return { success: false, error: "Configure a deployed contract address first." };
  }
  let hash = "";
  try {
    const accounts = (await window.ethereum.request({ method: "eth_requestAccounts" })) as string[];
    if (!accounts[0]) return { success: false, error: "No wallet account selected." };

    const client = createClient({
      chain: chainMap[network] ?? studionet,
      ...(endpoint ? { endpoint } : {}),
      provider: window.ethereum,
      account: accounts[0] as `0x${string}`,
    }) as unknown as RuntimeClient;
    if (client.connect) await client.connect(network);

    const raw = await client.writeContract({ address: addr, functionName, args, value });
    hash = typeof raw === "string" ? raw : raw.txId;

    const receipt = await client.waitForTransactionReceipt({
      hash: hash as `0x${string}`,
      status: TransactionStatus.ACCEPTED,
      interval: 2000,
      retries: 100,
    });

    let observed = receipt;
    try {
      observed = await client.getTransaction({ hash: hash as `0x${string}` });
    } catch { /* receipt remains authoritative */ }

    const failure = findRuntimeFailure(observed) || findRuntimeFailure(receipt);
    if (failure) {
      return { success: false, hash, error: `Contract rejected this action: ${failure.payload}` };
    }

    return {
      success: true,
      hash,
      status: String(observed.statusName || receipt.statusName || "ACCEPTED"),
      data: receipt,
    };
  } catch (error) {
    return { success: false, hash, error: error instanceof Error ? error.message : "Contract write failed." };
  }
}

export function unwrap<T>(value: unknown): T | null {
  try {
    if (typeof value === "string") return JSON.parse(value) as T;
    if (value && typeof value === "object" && "result" in value) {
      return unwrap<T>((value as { result: unknown }).result);
    }
    return value as T;
  } catch {
    return null;
  }
}

export const deliveryStatusColor: Record<string, string> = {
  DELIVERY_OPEN: "",
  SCHEDULED: "",
  COURIER_ACCEPTED: "",
  IN_TRANSIT: "",
  DELIVERED: "green",
  DISPUTED: "amber",
  ADJUDICATED: "green",
  RECOVERY: "amber",
  CLOSED: "green",
  FULL_PAYOUT: "green",
  PARTIAL_PAYOUT_75: "green",
  PARTIAL_PAYOUT_50: "amber",
  SENDER_REFUND: "red",
  EVIDENCE_CONFLICT: "amber",
  SENDER_NON_FUNDING: "red",
  COURIER_DELIVERY_DEFAULT: "red",
  SENDER_CONFIRMATION_DEFAULT: "red",
  ADJUDICATION_TIMEOUT: "red",
  EVIDENCE_RECOVERY: "amber",
};

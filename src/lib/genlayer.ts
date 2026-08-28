import { createClient } from "genlayer-js";
import { localnet, studionet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";

type NetworkName = "localnet" | "studionet";

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      isMetaMask?: boolean;
    };
  }
}

const network = (process.env.NEXT_PUBLIC_NETWORK as NetworkName) || "studionet";
const endpoint = process.env.NEXT_PUBLIC_GENLAYER_RPC;
const chainMap = { localnet, studionet };
const explorerBase = process.env.NEXT_PUBLIC_EXPLORER_BASE || "https://explorer-studio.genlayer.com/address/";
const RPC_URL = "https://studio.genlayer.com/api";

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

async function rpcCall(method: string, params: unknown[]): Promise<unknown> {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method, params, id: Date.now() }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message || JSON.stringify(json.error));
  return json.result;
}

function encodeArgs(args: unknown[]): string {
  const parts = args.map((a) => {
    if (typeof a === "bigint") return "0x" + a.toString(16);
    if (typeof a === "number") return "0x" + BigInt(a).toString(16);
    return String(a);
  });
  return parts.join("");
}

async function fallbackWrite(
  functionName: string,
  args: unknown[],
  value: bigint,
  from: string,
): Promise<ContractResult> {
  const addr = address();
  const calldata = "0x" + (() => {
    const sig = FUNCTION_SIGS[functionName];
    if (!sig) throw new Error("Unknown function: " + functionName);
    return sig + encodeDynamicArgs(args);
  })();

  const txParams = {
    from,
    to: addr,
    data: calldata,
    value: "0x" + value.toString(16),
  };

  console.log("[DelivSafe] fallback eth_sendTransaction:", { functionName, args: args.map(String), value: value.toString() });

  const txHash = (await window.ethereum!.request({
    method: "eth_sendTransaction",
    params: [txParams],
  })) as string;

  console.log("[DelivSafe] tx sent:", txHash);

  let receipt: Record<string, unknown> | null = null;
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    try {
      receipt = (await rpcCall("eth_getTransactionReceipt", [txHash])) as Record<string, unknown> | null;
      if (receipt) break;
    } catch { /* retry */ }
  }

  if (!receipt) return { success: false, hash: txHash, error: "Timeout waiting for receipt." };

  const status = Number(receipt.status);
  if (status !== 1) {
    const failure = findRuntimeFailure(receipt);
    return { success: false, hash: txHash, error: failure ? `Contract rejected: ${failure.payload}` : "Transaction reverted." };
  }

  return { success: true, hash: txHash, status: "FINALIZED", data: receipt };
}

function keccak256_hex(input: string): string {
  let h = 0x67452301;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  }
  return ("00000000" + ((h >>> 0) & 0xffffffff).toString(16)).slice(-8);
}

const FUNCTION_SIGS: Record<string, string> = {
  create_delivery: keccak256_hex("create_delivery(string,string,string,uint256,string,string)").slice(0, 8),
  set_schedule: keccak256_hex("set_schedule(uint256,uint256,uint256,uint256,uint256)").slice(0, 8),
  accept_delivery: keccak256_hex("accept_delivery(uint256)").slice(0, 8),
  fund_delivery: keccak256_hex("fund_delivery(uint256)").slice(0, 8),
  record_checkpoint: keccak256_hex("record_checkpoint(uint256,string,string,string,uint256)").slice(0, 8),
  confirm_completion: keccak256_hex("confirm_completion(uint256)").slice(0, 8),
  open_dispute: keccak256_hex("open_dispute(uint256)").slice(0, 8),
  adjudicate: keccak256_hex("adjudicate(uint256)").slice(0, 8),
  settle: keccak256_hex("settle(uint256)").slice(0, 8),
  recover: keccak256_hex("recover(uint256)").slice(0, 8),
};

function encodeDynamicArgs(args: unknown[]): string {
  const HEAD_LEN = 64;
  const heads: string[] = [];
  const tails: string[] = [];
  let tailOffset = args.length * HEAD_LEN;

  for (const arg of args) {
    if (typeof arg === "bigint" || typeof arg === "number") {
      const hex = typeof arg === "bigint" ? arg.toString(16) : BigInt(arg).toString(16);
      heads.push(hex.padStart(64, "0"));
    } else if (typeof arg === "string" && arg.startsWith("0x") && arg.length === 42) {
      heads.push(arg.toLowerCase().slice(2).padStart(64, "0"));
    } else if (typeof arg === "string") {
      const strHex = Array.from(new TextEncoder().encode(arg)).map(b => b.toString(16).padStart(2, "0")).join("");
      const strLen = arg.length.toString(16).padStart(64, "0");
      const padded = strHex.padEnd(Math.ceil(strHex.length / 128) * 128, "0");
      heads.push(tailOffset.toString(16).padStart(64, "0"));
      tails.push(strLen + padded);
      tailOffset += 64 + padded.length / 2;
    } else {
      heads.push("0".padStart(64, "0"));
    }
  }
  return heads.join("") + tails.join("");
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

    let useFallback = false;
    const client = createClient({
      chain: chainMap[network] ?? studionet,
      ...(endpoint ? { endpoint } : {}),
      provider: window.ethereum,
      account: accounts[0] as `0x${string}`,
    }) as unknown as RuntimeClient;

    try {
      if (client.connect) await client.connect(network);
    } catch (connectErr: unknown) {
      const msg = connectErr instanceof Error ? connectErr.message : String(connectErr);
      if (msg.includes("wallet_getSnaps") || msg.includes("Snaps") || msg.includes("doesn't has corresponding handler")) {
        console.log("[DelivSafe] Snap not available, using eth_sendTransaction fallback");
        useFallback = true;
      } else {
        throw connectErr;
      }
    }

    if (useFallback) {
      return await fallbackWrite(functionName, args, value, accounts[0]);
    }

    const raw = await client.writeContract({ address: addr, functionName, args, value });
    hash = typeof raw === "string" ? raw : raw.txId;
    console.log("[DelivSafe] writeContract sent:", { functionName, args: args.map(String), hash });

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
      console.error("[DelivSafe] contract error:", failure);
      return { success: false, hash, error: `Contract rejected: ${failure.payload}` };
    }

    return {
      success: true,
      hash,
      status: String(observed.statusName || receipt.statusName || "ACCEPTED"),
      data: receipt,
    };
  } catch (error) {
    console.error("[DelivSafe] write failed:", error);
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

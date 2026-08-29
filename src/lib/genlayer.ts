import { createClient } from "genlayer-js";
import { localnet, studionet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";

type NetworkName = "localnet" | "studionet";

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      isMetaMask?: boolean;
      providers?: any[];
    };
    rabby?: any;
  }
}

const network = (process.env.NEXT_PUBLIC_NETWORK as NetworkName) || "studionet";
const endpoint = process.env.NEXT_PUBLIC_GENLAYER_RPC;
const chainMap = { localnet, studionet };
const explorerBase = process.env.NEXT_PUBLIC_EXPLORER_BASE || "https://explorer-studio.genlayer.com/address/";
const STUDIONET_CHAIN_ID = "0xF22F";

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

const IGNORED_ERROR_CODES = new Set([
  "CONSENSUS_VALIDATOR_QUORUM_REACHED",
  "VALIDATOR_QUORUM_REACHED",
]);

function shouldIgnoreReceipt(record: Record<string, unknown>): boolean {
  const topLevel =
    IGNORED_ERROR_CODES.has(String(record.error_code ?? "").toUpperCase()) ||
    String(record.stderr ?? "").toLowerCase().includes("cancelled after quorum");
  if (topLevel) return true;
  const gv = record.genvm_result as Record<string, unknown> | undefined;
  if (gv) {
    if (IGNORED_ERROR_CODES.has(String(gv.error_code ?? "").toUpperCase())) return true;
    if (String(gv.stderr ?? "").toLowerCase().includes("cancelled after quorum")) return true;
    const raw = gv.raw_error as Record<string, unknown> | undefined;
    if (raw && Array.isArray(raw.causes)) {
      const causes = raw.causes.map(c => String(c).toUpperCase());
      if (causes.some(c => IGNORED_ERROR_CODES.has(c))) return true;
    }
  }
  return false;
}

function findRuntimeFailure(value: unknown, seen = new Set<unknown>()): RuntimeFailure | null {
  if (!value || typeof value !== "object" || seen.has(value)) return null;
  seen.add(value);
  const record = value as Record<string, unknown>;
  if (shouldIgnoreReceipt(record)) return null;
  const status = String(record.status ?? record.execution_result ?? record.txExecutionResultName ?? "").toUpperCase();
  if (["ROLLBACK", "CONTRACT_ERROR", "ERROR", "FAILED", "FINISHED_WITH_ERROR"].some(marker => status.includes(marker))) {
    const raw = record.payload ?? record.error_description ?? record.raw_error ?? record.message ?? record.stderr ?? record.stdout ?? status;
    const payload = typeof raw === "string" ? raw : JSON.stringify(raw);
    if (payload === status) {
      console.error("[DelivSafe] receipt with ERROR status (no payload):", JSON.stringify(record, null, 2));
    }
    return { kind: status || "CONTRACT_ERROR", payload };
  }
  for (const nested of Object.values(record)) {
    const failure = findRuntimeFailure(nested, seen);
    if (failure) return failure;
  }
  return null;
}

function wrapProvider(provider: any) {
  if (!provider || provider.__glPatched) return provider;
  const orig = provider.request.bind(provider);
  provider.request = async (req: any) => {
    if (req?.method === "eth_sendTransaction" && Array.isArray(req.params) && req.params[0]) {
      const tx = { ...req.params[0] };
      tx.type = "0x0";
      tx.gasPrice = "0x0";
      delete tx.maxFeePerGas;
      delete tx.maxPriorityFeePerGas;
      if (!tx.gas) tx.gas = "0x100000";
      console.log("[DelivSafe] wrapProvider intercepted eth_sendTransaction:", tx);
      return orig({ method: "eth_sendTransaction", params: [tx] });
    }
    return orig(req);
  };
  provider.__glPatched = true;
  return provider;
}

async function ensureStudionetChain(provider: any) {
  try {
    const currentChainId = await provider.request({ method: "eth_chainId" });
    if (currentChainId === STUDIONET_CHAIN_ID) return;
  } catch { /* ignore */ }

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: STUDIONET_CHAIN_ID }],
    });
  } catch (switchErr: any) {
    if (switchErr?.code === 4902) {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: STUDIONET_CHAIN_ID,
          chainName: "Genlayer Studio Network",
          nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
          rpcUrls: ["https://studio.genlayer.com/api"],
          blockExplorerUrls: ["https://explorer-studio.genlayer.com"],
        }],
      });
    } else {
      throw switchErr;
    }
  }
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
  const contractAddr = address();
  if (!contractAddr || contractAddr.endsWith("0".repeat(40))) {
    return { success: false, error: "Configure a deployed contract address first." };
  }
  let hash = "";
  try {
    console.log("[DelivSafe] writeContract start:", { functionName, args: args.map(String), value: value.toString() });

    const accounts = (await window.ethereum.request({ method: "eth_requestAccounts" })) as string[];
    console.log("[DelivSafe] accounts:", accounts);
    if (!accounts[0]) return { success: false, error: "No wallet account selected." };

    const walletAddress = accounts[0] as `0x${string}`;

    await ensureStudionetChain(window.ethereum);
    console.log("[DelivSafe] chain verified");

    const wrappedProvider = wrapProvider(window.ethereum);

    const client = createClient({
      chain: chainMap[network] ?? studionet,
      ...(endpoint ? { endpoint } : {}),
      provider: wrappedProvider,
      account: walletAddress,
    }) as unknown as RuntimeClient;
    console.log("[DelivSafe] SDK client created (no Snap needed)");

    console.log("[DelivSafe] calling client.writeContract...");
    const raw = await client.writeContract({ address: contractAddr, functionName, args, value });
    hash = typeof raw === "string" ? raw : raw.txId;
    console.log("[DelivSafe] writeContract sent:", { functionName, args: args.map(String), hash });

    console.log("[DelivSafe] waiting for receipt...");
    const receipt = await client.waitForTransactionReceipt({
      hash: hash as `0x${string}`,
      status: TransactionStatus.ACCEPTED,
      interval: 2000,
      retries: 100,
    });
    console.log("[DelivSafe] receipt received:", receipt);

    let observed = receipt;
    try {
      observed = await client.getTransaction({ hash: hash as `0x${string}` });
      console.log("[DelivSafe] getTransaction result:", observed);
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

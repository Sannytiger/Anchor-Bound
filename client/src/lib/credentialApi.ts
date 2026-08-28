const configuredBase = String(import.meta.env.VITE_CREDENTIAL_API_URL || "").trim();
const API_BASE = (configuredBase || window.location.origin).replace(/\/$/, "");

export type CredentialRecord = {
  tokenId: number;
  recipientAddress: string;
  recipientName: string;
  documentTitle: string;
  issuerName: string;
  template: string;
  fileHash: string;
  tokenURI: string;
  txHash: string;
  issuedAt: string;
  metadata?: Record<string, unknown>;
};

export type VerifyResponse = {
  valid: boolean;
  tokenId?: string;
  recipientName?: string;
  documentTitle?: string;
  issuerName?: string;
  ownerAddress?: string;
  fileHash?: string;
  metadata?: Record<string, unknown>;
  tokenURI?: string;
  issuedAt?: string;
  error?: string;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, { credentials: "include",
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
  return payload as T;
}

export const credentialApi = {
  health: () => request<{ status: string; network: string; contract: string }>("/api/health"),
  verify: (query: string) => request<VerifyResponse>(`/api/verify/${encodeURIComponent(query)}`),
  issue: (body: {
    recipientAddress: string;
    recipientName: string;
    documentTitle: string;
    issuerName?: string;
    template?: string;
    fileHash?: string;
  }) => request<{ success: boolean; tokenId: number; transactionHash: string; ipfsUri: string; record: CredentialRecord }>("/api/issue", {
    method: "POST",
    body: JSON.stringify(body),
  }),
  portfolio: (recipient: string) => request<{ records: CredentialRecord[] }>(`/api/portfolio/${encodeURIComponent(recipient)}`),
  registry: () => request<{ contractAddress: string; issuers: Array<{ name: string; issuedCount: number; status: string }> }>("/api/registry"),
};

export { API_BASE };

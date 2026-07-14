import { apiRequest } from "./apiClient";

export async function deleteAccount(): Promise<void> {
  await apiRequest("/api/account", "DELETE", { confirmation: "DELETE" });
}

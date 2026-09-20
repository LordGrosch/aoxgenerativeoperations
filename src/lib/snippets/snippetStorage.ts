import type { WorkflowSnippet } from "../model/snippet";

const STORAGE_KEY = "aox-snippets-v1";

export function loadSnippets(): WorkflowSnippet[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as WorkflowSnippet[]) : [];
  } catch {
    return [];
  }
}

export function persistSnippets(snippets: WorkflowSnippet[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snippets));
  } catch {
    // Quota dépassé ou storage indisponible : pas critique, on ignore.
  }
}

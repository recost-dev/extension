import { ApiCallMatch, LineMatcher } from "./types";
import { lookupMethod } from "../fingerprints/registry";

export const firebaseSupabaseMatcher: LineMatcher = {
  name: "firebase-supabase",
  matchLine(line: string): ApiCallMatch[] {
    const matches: ApiCallMatch[] = [];

    // ── Supabase: table CRUD ──────────────────────────────────────────────────
    const supabaseTableRegex =
      /\b([A-Za-z_$][\w$]*)\.from\(\s*['"`]([^'"`]+)['"`]\s*\)\.(select|insert|update|delete|upsert)\s*\(/gi;
    let supabaseTableMatch: RegExpExecArray | null;
    while ((supabaseTableMatch = supabaseTableRegex.exec(line)) !== null) {
      const table = supabaseTableMatch[2];
      const action = supabaseTableMatch[3].toLowerCase();
      const pattern = `from.${action}`;
      const reg = lookupMethod("supabase", pattern);

      const fbMethod = action === "select" ? "GET" : action === "delete" ? "DELETE" : action === "update" ? "PATCH" : "POST";

      if (!reg) console.warn(`[fingerprints] no registry entry for supabase/${pattern}`);

      matches.push({
        kind: "sdk",
        provider: "supabase",
        sdk: "supabase-js",
        method: reg?.httpMethod ?? fbMethod,
        // Keep dynamic endpoint with actual table name captured from code
        endpoint: `https://{supabase-host}/rest/v1/${table}`,
        resource: table,
        action,
        batchCapable: reg?.batchCapable ?? (action === "insert" || action === "upsert"),
        cacheCapable: reg?.cacheCapable ?? action === "select",
        rawMatch: supabaseTableMatch[0],
      });
    }

    // ── Supabase: storage ─────────────────────────────────────────────────────
    const supabaseStorageRegex =
      /\b([A-Za-z_$][\w$]*)\.storage\.from\(\s*['"`]([^'"`]+)['"`]\s*\)\.(upload|download|list|remove|getPublicUrl)\s*\(/gi;
    let supabaseStorageMatch: RegExpExecArray | null;
    while ((supabaseStorageMatch = supabaseStorageRegex.exec(line)) !== null) {
      const bucket = supabaseStorageMatch[2];
      const action = supabaseStorageMatch[3];
      const pattern = `storage.from.${action}`;
      const reg = lookupMethod("supabase", pattern);

      const fbMethod = /download|list|getPublicUrl/i.test(action) ? "GET" : action === "remove" ? "DELETE" : "POST";

      if (!reg) console.warn(`[fingerprints] no registry entry for supabase/${pattern}`);

      matches.push({
        kind: "sdk",
        provider: "supabase",
        sdk: "supabase-js",
        method: reg?.httpMethod ?? fbMethod,
        // Keep dynamic endpoint with actual bucket name captured from code
        endpoint: `https://{supabase-host}/storage/v1/object/${bucket}`,
        resource: `storage/${bucket}`,
        action,
        batchCapable: reg?.batchCapable,
        cacheCapable: reg?.cacheCapable,
        rawMatch: supabaseStorageMatch[0],
      });
    }

    // ── Supabase: auth ────────────────────────────────────────────────────────
    const supabaseAuthRegex =
      /\b([A-Za-z_$][\w$]*)\.auth\.(signInWithPassword|signUp|refreshSession|getUser|signOut)\s*\(/gi;
    let supabaseAuthMatch: RegExpExecArray | null;
    while ((supabaseAuthMatch = supabaseAuthRegex.exec(line)) !== null) {
      const action = supabaseAuthMatch[2];
      const pattern = `auth.${action}`;
      const reg = lookupMethod("supabase", pattern);

      const fbMethod = /getUser/i.test(action) ? "GET" : "POST";

      if (!reg) console.warn(`[fingerprints] no registry entry for supabase/${pattern}`);

      matches.push({
        kind: "sdk",
        provider: "supabase",
        sdk: "supabase-js",
        method: reg?.httpMethod ?? fbMethod,
        endpoint: reg?.endpoint ?? "https://{supabase-host}/auth/v1",
        resource: "auth",
        action,
        cacheCapable: reg?.cacheCapable,
        rawMatch: supabaseAuthMatch[0],
      });
    }

    // ── Firebase: Firestore document operations ───────────────────────────────
    const firebaseDocRegex = /\b(getDoc|getDocs|setDoc|updateDoc|addDoc|deleteDoc)\s*\(/g;
    let firebaseDocMatch: RegExpExecArray | null;
    while ((firebaseDocMatch = firebaseDocRegex.exec(line)) !== null) {
      const action = firebaseDocMatch[1];
      const reg = lookupMethod("firebase", action);

      const fbMethod =
        action === "getDoc" || action === "getDocs"
          ? "GET"
          : action === "deleteDoc"
            ? "DELETE"
            : action === "updateDoc"
              ? "PATCH"
              : "POST";

      if (!reg) console.warn(`[fingerprints] no registry entry for firebase/${action}`);

      matches.push({
        kind: "sdk",
        provider: "firebase",
        sdk: "firebase",
        method: reg?.httpMethod ?? fbMethod,
        endpoint: reg?.endpoint ?? "https://firestore.googleapis.com/v1/{documentPath}",
        resource: "firestore",
        action,
        batchCapable: reg?.batchCapable ?? (action === "setDoc" || action === "updateDoc"),
        cacheCapable: reg?.cacheCapable ?? (action === "getDoc" || action === "getDocs"),
        rawMatch: firebaseDocMatch[0],
      });
    }

    // ── Firebase: real-time listeners ─────────────────────────────────────────
    const firebaseListenerRegex = /\b(onSnapshot|onValue|addSnapshotListener)\s*\(/g;
    let firebaseListenerMatch: RegExpExecArray | null;
    while ((firebaseListenerMatch = firebaseListenerRegex.exec(line)) !== null) {
      const action = firebaseListenerMatch[1];
      const reg = lookupMethod("firebase", action);

      if (!reg) console.warn(`[fingerprints] no registry entry for firebase/${action}`);

      matches.push({
        kind: "rpc",
        provider: "firebase",
        sdk: "firebase",
        method: reg?.httpMethod ?? "SUBSCRIBE",
        endpoint: reg?.endpoint ?? "firestore://listener",
        resource: "listener",
        action,
        streaming: reg?.streaming ?? true,
        inferredCostRisk: ["repeated-subscription"],
        rawMatch: firebaseListenerMatch[0],
      });
    }

    // ── Firebase: Storage ─────────────────────────────────────────────────────
    const firebaseStorageRegex = /\b(uploadBytes|uploadBytesResumable|getDownloadURL|deleteObject|listAll)\s*\(/g;
    let firebaseStorageMatch: RegExpExecArray | null;
    while ((firebaseStorageMatch = firebaseStorageRegex.exec(line)) !== null) {
      const action = firebaseStorageMatch[1];
      const reg = lookupMethod("firebase", action);

      const fbMethod = /getDownloadURL|listAll/i.test(action) ? "GET" : /delete/i.test(action) ? "DELETE" : "POST";

      if (!reg) console.warn(`[fingerprints] no registry entry for firebase/${action}`);

      matches.push({
        kind: "sdk",
        provider: "firebase",
        sdk: "firebase-storage",
        method: reg?.httpMethod ?? fbMethod,
        endpoint: reg?.endpoint ?? "https://firebasestorage.googleapis.com/v0/b/{bucket}/o",
        resource: "storage",
        action,
        cacheCapable: reg?.cacheCapable,
        rawMatch: firebaseStorageMatch[0],
      });
    }

    return matches;
  },
};

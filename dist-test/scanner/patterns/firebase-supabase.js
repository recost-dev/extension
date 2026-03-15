"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.firebaseSupabaseMatcher = void 0;
exports.firebaseSupabaseMatcher = {
    name: "firebase-supabase",
    matchLine(line) {
        const matches = [];
        const supabaseTableRegex = /\b([A-Za-z_$][\w$]*)\.from\(\s*['"`]([^'"`]+)['"`]\s*\)\.(select|insert|update|delete|upsert)\s*\(/gi;
        let supabaseTableMatch;
        while ((supabaseTableMatch = supabaseTableRegex.exec(line)) !== null) {
            const table = supabaseTableMatch[2];
            const action = supabaseTableMatch[3].toLowerCase();
            const method = action === "select" ? "GET" : action === "delete" ? "DELETE" : action === "update" ? "PATCH" : "POST";
            matches.push({
                kind: "sdk",
                provider: "supabase",
                sdk: "supabase-js",
                method,
                endpoint: `https://{supabase-host}/rest/v1/${table}`,
                resource: table,
                action,
                batchCapable: action === "insert" || action === "upsert",
                cacheCapable: action === "select",
                rawMatch: supabaseTableMatch[0],
            });
        }
        const supabaseStorageRegex = /\b([A-Za-z_$][\w$]*)\.storage\.from\(\s*['"`]([^'"`]+)['"`]\s*\)\.(upload|download|list|remove|getPublicUrl)\s*\(/gi;
        let supabaseStorageMatch;
        while ((supabaseStorageMatch = supabaseStorageRegex.exec(line)) !== null) {
            const bucket = supabaseStorageMatch[2];
            const action = supabaseStorageMatch[3];
            const method = /download|list|getPublicUrl/i.test(action) ? "GET" : action === "remove" ? "DELETE" : "POST";
            matches.push({
                kind: "sdk",
                provider: "supabase",
                sdk: "supabase-js",
                method,
                endpoint: `https://{supabase-host}/storage/v1/object/${bucket}`,
                resource: `storage/${bucket}`,
                action,
                rawMatch: supabaseStorageMatch[0],
            });
        }
        const supabaseAuthRegex = /\b([A-Za-z_$][\w$]*)\.auth\.(signInWithPassword|signUp|refreshSession|getUser|signOut)\s*\(/gi;
        let supabaseAuthMatch;
        while ((supabaseAuthMatch = supabaseAuthRegex.exec(line)) !== null) {
            const action = supabaseAuthMatch[2];
            const method = /getUser/i.test(action) ? "GET" : "POST";
            matches.push({
                kind: "sdk",
                provider: "supabase",
                sdk: "supabase-js",
                method,
                endpoint: "https://{supabase-host}/auth/v1",
                resource: "auth",
                action,
                rawMatch: supabaseAuthMatch[0],
            });
        }
        const firebaseDocRegex = /\b(getDoc|getDocs|setDoc|updateDoc|addDoc|deleteDoc)\s*\(/g;
        let firebaseDocMatch;
        while ((firebaseDocMatch = firebaseDocRegex.exec(line)) !== null) {
            const action = firebaseDocMatch[1];
            const method = action === "getDoc" || action === "getDocs"
                ? "GET"
                : action === "deleteDoc"
                    ? "DELETE"
                    : action === "updateDoc"
                        ? "PATCH"
                        : "POST";
            matches.push({
                kind: "sdk",
                provider: "firebase",
                sdk: "firebase",
                method,
                endpoint: "https://firestore.googleapis.com/v1/{documentPath}",
                resource: "firestore",
                action,
                batchCapable: action === "setDoc" || action === "updateDoc",
                cacheCapable: action === "getDoc" || action === "getDocs",
                rawMatch: firebaseDocMatch[0],
            });
        }
        const firebaseListenerRegex = /\b(onSnapshot|onValue|addSnapshotListener)\s*\(/g;
        let firebaseListenerMatch;
        while ((firebaseListenerMatch = firebaseListenerRegex.exec(line)) !== null) {
            const action = firebaseListenerMatch[1];
            matches.push({
                kind: "rpc",
                provider: "firebase",
                sdk: "firebase",
                method: "SUBSCRIBE",
                endpoint: "firestore://listener",
                resource: "listener",
                action,
                streaming: true,
                inferredCostRisk: ["repeated-subscription"],
                rawMatch: firebaseListenerMatch[0],
            });
        }
        const firebaseStorageRegex = /\b(uploadBytes|uploadBytesResumable|getDownloadURL|deleteObject|listAll)\s*\(/g;
        let firebaseStorageMatch;
        while ((firebaseStorageMatch = firebaseStorageRegex.exec(line)) !== null) {
            const action = firebaseStorageMatch[1];
            const method = /getDownloadURL|listAll/i.test(action) ? "GET" : /delete/i.test(action) ? "DELETE" : "POST";
            matches.push({
                kind: "sdk",
                provider: "firebase",
                sdk: "firebase-storage",
                method,
                endpoint: "https://firebasestorage.googleapis.com/v0/b/{bucket}/o",
                resource: "storage",
                action,
                rawMatch: firebaseStorageMatch[0],
            });
        }
        return matches;
    },
};
//# sourceMappingURL=firebase-supabase.js.map
export type ScriptAction = 'write' | 'bulk' | 'history' | 'preview' | 'read' | 'report';
export type ScriptParamValue = string | number | boolean | null | undefined;
export type ScriptParams = Record<string, ScriptParamValue>;

export interface CallScriptOptions {
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
    retries?: number;
}

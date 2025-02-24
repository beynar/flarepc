import { parse, stringify } from 'devalue';

const getStmt = 'SELECT value FROM kv_store WHERE namespace = ? AND key = ?;';
const setStmt = 'INSERT OR REPLACE INTO kv_store (namespace, key, value) VALUES (?, ?, ?);';
const deleteStmt = 'DELETE FROM kv_store WHERE namespace = ? AND key = ?;';
const hasStmt = 'SELECT 1 FROM kv_store WHERE namespace = ? AND key = ?;';

export interface KVNamespace {
	get<T>(key: string, namespace?: string): T | null;
	set(key: string, value: unknown, namespace?: string): void;
	delete(key: string, namespace?: string): void;
	list(prefix?: string, namespace?: string): string[];
	has(key: string, namespace?: string): boolean;
	setMany(entries: [string, unknown][], namespace?: string): void;
	deleteMany(keys: string[], namespace?: string): void;
}

export class DurableKV implements KVNamespace {
	private sql: SqlStorage; // SQLite storage from Durable Object
	private readonly defaultNamespace = '0';
	private ready = false;

	constructor(state: DurableObjectState) {
		this.sql = state.storage.sql;
	}

	init = () => {
		this.sql.exec(`
            CREATE TABLE IF NOT EXISTS kv_store (
              namespace TEXT NOT NULL,
              key TEXT NOT NULL,
              value TEXT NOT NULL,
              PRIMARY KEY (namespace, key)
            );

            -- Create composite index for faster lookups and prefix searches
            CREATE INDEX IF NOT EXISTS idx_kv_store_namespace_key
            ON kv_store(namespace, key);
          `);
		this.ready = true;
	};

	get<T>(key: string, namespace: string = this.defaultNamespace): T | null {
		if (!this.ready) {
			throw new Error('KV is not ready');
		}
		const result = this.sql.exec(getStmt, namespace, key).toArray();
		if (result.length === 0 || !result[0].value) return null;
		return parse(String(result[0].value)) as T;
	}

	set(key: string, value: unknown, namespace: string = this.defaultNamespace): void {
		if (!this.ready) {
			throw new Error('KV is not ready');
		}
		const serialized = stringify(value);
		this.sql.exec(setStmt, namespace, key, serialized);
	}

	delete(key: string, namespace: string = this.defaultNamespace): void {
		if (!this.ready) {
			throw new Error('KV is not ready');
		}
		this.sql.exec(deleteStmt, namespace, key);
	}

	list(prefix: string = '', namespace: string = this.defaultNamespace): string[] {
		if (!this.ready) {
			throw new Error('KV is not ready');
		}
		const results = this.sql
			.exec('SELECT key FROM kv_store WHERE namespace = ? AND key LIKE ? ORDER BY key;', namespace, `${prefix}%`)
			.toArray();

		return results.map((row) => String(row.key)).filter((key) => typeof key === 'string' && key.startsWith(prefix));
	}

	has(key: string, namespace: string = this.defaultNamespace): boolean {
		if (!this.ready) {
			throw new Error('KV is not ready');
		}
		const result = this.sql.exec(hasStmt, namespace, key).toArray();
		return result.length > 0;
	}

	setMany(entries: [string, unknown][], namespace: string = this.defaultNamespace): void {
		if (!this.ready) {
			throw new Error('KV is not ready');
		}
		this.sql.exec('BEGIN TRANSACTION;');
		try {
			for (const [key, value] of entries) {
				const serialized = stringify(value);
				this.sql.exec(setStmt, namespace, key, serialized);
			}
			this.sql.exec('COMMIT;');
		} catch (error) {
			this.sql.exec('ROLLBACK;');
			throw error;
		}
	}

	deleteMany(keys: string[], namespace: string = this.defaultNamespace): void {
		if (!this.ready) {
			throw new Error('KV is not ready');
		}
		this.sql.exec('BEGIN TRANSACTION;');
		try {
			for (const key of keys) {
				this.sql.exec(deleteStmt, namespace, key);
			}
			this.sql.exec('COMMIT;');
		} catch (error) {
			this.sql.exec('ROLLBACK;');
			throw error;
		}
	}
}

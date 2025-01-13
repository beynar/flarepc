import { removeAwarenessStates } from 'y-protocols/awareness';
import { Doc, applyUpdate, encodeStateAsUpdate } from 'yjs';
import { WSSharedDoc, setupWSConnection } from './internal';
import { DurableOptions, DurableMeta, Env, Locals, DurableServer } from '..';
import { debounce } from './client';

export type WebSocketAttachment = {
	roomId: string;
	connectedAt: Date;
};

type DurableDocEvent = {
	ctx: DurableObjectState;
	env: Env;
	locals: Locals;
	meta: DurableMeta;
};
export type AwarenessChanges = {
	added: number[];
	updated: number[];
	removed: number[];
};

type DurableDocOptions =
	| (DurableOptions & {
			storage?: {
				debounceMs?: number;
				saveDoc: (event: { snapshot: Uint8Array; doc: Doc } & DurableDocEvent) => Promise<void>;
				getDoc: (event: { doc: Doc } & DurableDocEvent) => Promise<Doc | Uint8Array>;
			};
	  })
	| undefined;

const chunkUint8Array = (update: Uint8Array) => {
	const chunkSize = 128 * 1024; // 128 KiB
	const chunks: Uint8Array[] = [];
	for (let i = 0; i < update.length; i += chunkSize) {
		chunks.push(update.slice(i, i + chunkSize));
	}
	return chunks;
};

const mergeUint8Array = (chunks: IterableIterator<Uint8Array>) => {
	let totalLength = 0;
	const chunksArray = [];
	for (const chunk of chunks) {
		totalLength += chunk.length;
		chunksArray.push(chunk);
	}
	const merged = new Uint8Array(totalLength);
	let offset = 0;
	for (const chunk of chunksArray) {
		merged.set(chunk, offset);
		offset += chunk.length;
	}
	return merged;
};

async function getYDoc(this: DurableDoc): Promise<Doc> {
	const doc = new Doc();
	if (this.opts?.storage?.getDoc) {
		const snapshot = await this.opts.storage.getDoc(
			Object.assign(durableDocEvent.bind(this)(), {
				doc,
			}),
		);
		if (snapshot instanceof Uint8Array) {
			applyUpdate(doc, snapshot);
		} else if (snapshot instanceof Doc) {
			return snapshot;
		}
	} else {
		const chunks = await this.ctx.storage.list<Uint8Array>({
			prefix: 'snapshot_chunk',
		});
		if (chunks.size === 0) {
			return doc;
		}
		applyUpdate(doc, mergeUint8Array(chunks.values()));
	}
	return doc;
}

async function saveYDoc(this: DurableDoc): Promise<void> {
	const snapshot = encodeStateAsUpdate(this.doc);
	if (this.opts?.storage?.saveDoc) {
		return this.opts.storage.saveDoc(
			Object.assign(durableDocEvent.bind(this)(), {
				snapshot,
				doc: this.doc,
			}),
		);
	} else {
		const chunks = chunkUint8Array(snapshot);
		return this.ctx.storage.transaction(async (tx) => {
			const previousChunks = await tx.list({
				prefix: 'snapshot_chunk',
			});
			const chunksToDelete = Array.from(previousChunks.keys()).slice(chunks.length);
			await Promise.all(chunksToDelete.map((chunk) => tx.delete(chunk)));
			await Promise.all(chunks.map((chunk, i) => tx.put(`snapshot_chunk_${i}`, chunk)));
		});
	}
}

function durableDocEvent(this: DurableDoc): DurableDocEvent {
	return {
		ctx: this.ctx,
		env: this.env,
		locals: this.locals,
		meta: this.meta,
	};
}

async function handleAwarenessUpdate(this: DurableDoc, { added, removed, updated }: AwarenessChanges) {
	added.concat(updated).forEach((client) => this.awarenessClients.add(client));
	removed.forEach((client) => this.awarenessClients.delete(client));
}

export class DurableDoc extends DurableServer {
	_TYPE: any = 'DURABLE_DOC';
	doc = new WSSharedDoc();
	declare opts: DurableDocOptions;
	sessions = new Map<WebSocket, () => void>();
	awarenessClients = new Set<number>();
	setMeta(meta: DurableMeta) {
		this.meta = meta;
		this.ctx.storage.put(this.meta);
	}
	constructor(
		public state: DurableObjectState,
		public env: Env,
	) {
		super(state, env);

		void this.state.blockConcurrencyWhile(async () => {
			applyUpdate(this.doc, encodeStateAsUpdate(await getYDoc.bind(this)()));
			this.state.getWebSockets().forEach(this.onConnectionOpen);
			this.doc.on(
				'update',
				debounce(() => {
					saveYDoc.bind(this)();
				}, this.opts?.storage?.debounceMs || 1500),
			);
			this.doc.awareness.on('update', handleAwarenessUpdate.bind(this));
		});
	}

	onConnectionClose = async (ws: WebSocket) => {
		this.sessions.get(ws)?.();
		this.sessions.delete(ws);
		removeAwarenessStates(this.doc.awareness, Array.from(this.awarenessClients), null);
		if (this.sessions.size < 1) {
			saveYDoc.bind(this)();
		}
	};

	onArrayBufferMessage = async (_ws: WebSocket, message: ArrayBuffer) => {
		this.doc.update(new Uint8Array(message));
	};

	onConnectionOpen = (ws: WebSocket) => {
		setupWSConnection.bind(this)(ws);
		const cleanUp = this.doc.register((message) => {
			ws.send(message);
		});
		this.sessions.set(ws, cleanUp);
	};
}

export const createDurableDoc = (opts?: DurableDocOptions) => {
	return class extends DurableDoc {
		_TYPE = 'DURABLE_DOC' as const;
		opts = opts;
	};
};

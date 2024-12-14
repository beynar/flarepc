import { createDecoder, readVarUint, readVarUint8Array } from 'lib0/decoding';
import { createEncoder, Encoder, length, toUint8Array, writeVarUint, writeVarUint8Array } from 'lib0/encoding';
import { applyAwarenessUpdate, Awareness, encodeAwarenessUpdate } from 'y-protocols/awareness';
import { readSyncMessage, writeSyncStep1, writeUpdate } from 'y-protocols/sync';
import { Doc } from 'yjs';
import { DurableDoc } from './durableDoc';

type Listener<T> = (message: T) => void;

export const messageType = {
	sync: 0,
	awareness: 1,
} as const;

type MessageType = keyof typeof messageType;

export function setupWSConnection(this: DurableDoc, ws: WebSocket) {
	const syncEncoder = createTypedEncoder('sync');
	writeSyncStep1(syncEncoder, this.doc);
	ws.send(toUint8Array(syncEncoder));

	const states = this.doc.awareness.getStates();
	if (states.size > 0) {
		const awarenessEncoder = createTypedEncoder('awareness');
		const update = encodeAwarenessUpdate(this.doc.awareness, Array.from(states.keys()));
		writeVarUint8Array(awarenessEncoder, update);
		ws.send(toUint8Array(awarenessEncoder));
	}
}

export const createTypedEncoder = (type: MessageType): Encoder => {
	const encoder = createEncoder();
	writeVarUint(encoder, messageType[type]);
	return encoder;
};

export class WSSharedDoc extends Doc {
	private listeners = new Set<Listener<Uint8Array>>();
	readonly awareness: Awareness;

	constructor(gc = true) {
		super({ gc });
		this.awareness = new Awareness(this);
		this.awareness.setLocalState(null);
		this.awareness.on('update', this.awarenessChangeHandler);
		this.on('update', this.syncMessageHandler);
	}

	update = (message: Uint8Array) => {
		const decoder = createDecoder(message);
		const type = readVarUint(decoder);

		if (type === messageType.sync) {
			const encoder = createEncoder();
			writeVarUint(encoder, messageType.sync);
			readSyncMessage(decoder, encoder, this, null);
			if (length(encoder) > 1) {
				this.notify(encoder);
			}
		} else if (type === messageType.awareness) {
			applyAwarenessUpdate(this.awareness, readVarUint8Array(decoder), null);
		}
	};

	register = (listener: Listener<Uint8Array>) => {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	};

	private syncMessageHandler = (update: Uint8Array) => {
		const encoder = createTypedEncoder('sync');
		writeUpdate(encoder, update);
		this.notify(encoder);
	};

	private awarenessChangeHandler = ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }) => {
		const encoder = createTypedEncoder('awareness');
		const update = encodeAwarenessUpdate(this.awareness, added.concat(updated).concat(removed), this.awareness.states);
		writeVarUint8Array(encoder, update);
		this.notify(encoder);
	};

	private notify(encoder: Encoder) {
		const message = toUint8Array(encoder);
		this.listeners.forEach((listener) => listener(message));
	}
}

import { WebSocketClient } from '../websocket';
import * as Y from 'yjs';
import * as bc from 'lib0/broadcastchannel';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import { ObservableV2 } from 'lib0/observable';

const messageSync = 0;
const messageQueryAwareness = 3;
const messageAwareness = 1;

type Events = {
	sync: () => void;
};

export function debounce<T extends (...args: any[]) => void>(func: T, wait: number, sendFirst = true): (...args: Parameters<T>) => void {
	let timeout: ReturnType<typeof setTimeout> | null = null;
	let lastCallTime: number = 0;

	return (...args: Parameters<T>) => {
		const now = Date.now();
		const shouldCallImmediately = sendFirst && now - lastCallTime > wait;

		if (timeout !== null) {
			clearTimeout(timeout);
		}

		if (shouldCallImmediately) {
			func(...args);
			lastCallTime = now;
		} else {
			timeout = setTimeout(() => {
				func(...args);
				lastCallTime = Date.now();
			}, wait);
		}
	};
}

export type DocProviderOptions = {
	resyncInterval?: number;
	disableBroadcast?: boolean;
	awareness?: awarenessProtocol.Awareness;
	doc?: Y.Doc;
	debounceMs?: number;
};
export class DocProvider extends ObservableV2<Events> {
	doc: Y.Doc;
	awareness: awarenessProtocol.Awareness;
	synced = false;
	private ws?: WebSocket;
	private bcChannel: string;
	private bcconnected: boolean;
	private disableBroadcast: boolean;

	private wsClient: WebSocketClient;
	private _bcSubscriber: (data: ArrayBuffer, origin: any) => void;
	private _updateHandler: (update: Uint8Array, origin: any) => void;
	private _awarenessUpdateHandler: ({ added, updated, removed }: { added: any; updated: any; removed: any }, _origin: any) => void;
	private _resyncInterval: any;
	private debouncedBroadcastUpdate: () => void;

	private pendingUpdates: Uint8Array[] = [];
	private debounceMs: number = 0;

	constructor(
		ws: WebSocketClient<any, any>,
		{ resyncInterval = -1, disableBroadcast = false, awareness, doc, debounceMs = 0 }: DocProviderOptions = {}
	) {
		super();
		this.debounceMs = debounceMs;
		this.doc = doc || new Y.Doc();
		this.awareness = awareness || new awarenessProtocol.Awareness(this.doc);
		this.bcChannel = ws.url.toString();
		this.bcconnected = false;

		this.disableBroadcast = disableBroadcast;
		this._resyncInterval = resyncInterval;
		this.wsClient = ws;
		this.ws = ws.ws!;

		this._bcSubscriber = (data, origin) => {
			if (origin !== this) {
				const encoder = this.readMessage(new Uint8Array(data), false);
				if (encoding.length(encoder) > 1) {
					bc.publish(this.bcChannel, encoding.toUint8Array(encoder), this);
				}
			}
		};

		this.debouncedBroadcastUpdate = debounce(() => {
			const mergedUpdate = Y.mergeUpdates(this.pendingUpdates);
			this.pendingUpdates = [];
			this.broadcastChange(mergedUpdate);
		}, this.debounceMs);

		this._updateHandler = (update, origin) => {
			if (origin !== this) {
				if (this.debounceMs > 0) {
					this.pendingUpdates.push(update);
					this.debouncedBroadcastUpdate();
				} else {
					this.broadcastChange(update);
				}
			}
		};

		this._awarenessUpdateHandler = ({ added, updated, removed }, _origin) => {
			const changedClients = added.concat(updated).concat(removed);
			const encoder = encoding.createEncoder();
			encoding.writeVarUint(encoder, messageAwareness);
			encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(this.awareness, changedClients));
			this.broadcastMessage(encoding.toUint8Array(encoder));
		};

		// if (env.isNode && typeof process !== 'undefined') {
		// 	process.on('exit', this._exitHandler);
		// }

		this.onOpen();
		(globalThis as any).addEventListener('beforeunload', this.onClose);
		(globalThis as any).__flaredoc?.set(this.bcChannel, this);
		ws.on('arrayBufferMessage', this.onMessage);
		ws.on('close', this.onClose);
		ws.on('open', this.onOpen);
	}
	// ????
	private _exitHandler = () => {
		awarenessProtocol.removeAwarenessStates(this.awareness, [this.doc.clientID], 'app closed');
	};

	private broadcastChange = (update: Uint8Array) => {
		const encoder = encoding.createEncoder();
		encoding.writeVarUint(encoder, messageSync);
		syncProtocol.writeUpdate(encoder, update);
		this.broadcastMessage(encoding.toUint8Array(encoder));
	};

	private messageHandlers = {
		[messageSync]: (
			encoder: encoding.Encoder,
			decoder: decoding.Decoder,
			provider: DocProvider,
			_emitSynced: boolean,
			_messageType: number
		) => {
			encoding.writeVarUint(encoder, messageSync);
			const syncMessageType = syncProtocol.readSyncMessage(decoder, encoder, provider.doc, provider);
			if (syncMessageType === syncProtocol.messageYjsSyncStep2 && !provider.synced) {
				provider.synced = true;
				provider.emit('sync', []);
			}
		},

		[messageQueryAwareness]: (
			encoder: encoding.Encoder,
			_decoder: decoding.Decoder,
			provider: DocProvider,
			_emitSynced: boolean,
			_messageType: number
		) => {
			encoding.writeVarUint(encoder, messageAwareness);
			encoding.writeVarUint8Array(
				encoder,
				awarenessProtocol.encodeAwarenessUpdate(provider.awareness, Array.from(provider.awareness.getStates().keys()))
			);
		},

		[messageAwareness]: (
			_encoder: encoding.Encoder,
			decoder: decoding.Decoder,
			provider: DocProvider,
			_emitSynced: boolean,
			_messageType: number
		) => {
			awarenessProtocol.applyAwarenessUpdate(provider.awareness, decoding.readVarUint8Array(decoder), provider);
		},
	} as Record<
		number,
		(encoder: encoding.Encoder, decoder: decoding.Decoder, provider: DocProvider, emitSynced: boolean, messageType: number) => void
	>;

	private broadcastMessage(buf: Uint8Array) {
		this.wsClient.sendRaw(buf);
		if (this.bcconnected && !this.disableBroadcast) {
			bc.publish(this.bcChannel, buf, this);
		}
	}
	private connectBc() {
		if (this.disableBroadcast) {
			return;
		}
		if (!this.bcconnected) {
			bc.subscribe(this.bcChannel, this._bcSubscriber);
			this.bcconnected = true;
		}
		const encoderSync = encoding.createEncoder();
		encoding.writeVarUint(encoderSync, messageSync);
		syncProtocol.writeSyncStep1(encoderSync, this.doc);
		bc.publish(this.bcChannel, encoding.toUint8Array(encoderSync), this);
		const encoderState = encoding.createEncoder();
		encoding.writeVarUint(encoderState, messageSync);
		syncProtocol.writeSyncStep2(encoderState, this.doc);
		bc.publish(this.bcChannel, encoding.toUint8Array(encoderState), this);
		const encoderAwarenessQuery = encoding.createEncoder();
		encoding.writeVarUint(encoderAwarenessQuery, messageQueryAwareness);
		bc.publish(this.bcChannel, encoding.toUint8Array(encoderAwarenessQuery), this);
		const encoderAwarenessState = encoding.createEncoder();
		encoding.writeVarUint(encoderAwarenessState, messageAwareness);
		encoding.writeVarUint8Array(encoderAwarenessState, awarenessProtocol.encodeAwarenessUpdate(this.awareness, [this.doc.clientID]));
		bc.publish(this.bcChannel, encoding.toUint8Array(encoderAwarenessState), this);
	}

	private disconnectBc() {
		const encoder = encoding.createEncoder();
		encoding.writeVarUint(encoder, messageAwareness);
		encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(this.awareness, [this.doc.clientID], new Map()));
		this.broadcastMessage(encoding.toUint8Array(encoder));
		if (this.bcconnected) {
			bc.unsubscribe(this.bcChannel, this._bcSubscriber);
			this.bcconnected = false;
		}
	}

	private readMessage = (buf: Uint8Array, emitSynced: boolean): encoding.Encoder => {
		const decoder = decoding.createDecoder(buf);
		const encoder = encoding.createEncoder();
		const messageType = decoding.readVarUint(decoder);
		const messageHandler = this.messageHandlers[messageType];
		if (messageHandler) {
			messageHandler(encoder, decoder, this, emitSynced, messageType);
		} else {
			console.error('Unable to compute message');
		}
		return encoder;
	};

	private onMessage = async (event: MessageEvent) => {
		if (event.data instanceof ArrayBuffer) {
			const encoder = this.readMessage(new Uint8Array(event.data), true);
			if (encoding.length(encoder) > 1) {
				this.wsClient?.sendRaw(encoding.toUint8Array(encoder));
			}
		}
	};

	private onClose = () => {
		this.ws = undefined;
		awarenessProtocol.removeAwarenessStates(
			this.awareness,
			Array.from(this.awareness.getStates().keys()).filter((client) => client !== this.doc.clientID),
			this
		);
		if (this._resyncInterval !== 0) {
			clearInterval(this._resyncInterval);
		}
		// if (env.isNode && typeof process !== 'undefined') {
		// 	process.off('exit', this._exitHandler);
		// }
		this.disconnectBc();
		this.awareness.off('update', this._awarenessUpdateHandler);
		this.doc.off('update', this._updateHandler);
		this.wsClient.off('arrayBufferMessage', this.onMessage);
		this.wsClient.off('close', this.onClose);
		this.wsClient.off('open', this.onOpen);
	};

	private onOpen = () => {
		this.doc.on('update', this._updateHandler);
		this.awareness.on('update', this._awarenessUpdateHandler);
		this.connectBc();
		// @ts-ignore
		if (this._resyncInterval > 0) {
			this._resyncInterval = setInterval(() => {
				const encoder = encoding.createEncoder();
				encoding.writeVarUint(encoder, messageSync);
				syncProtocol.writeSyncStep1(encoder, this.doc);
				this.wsClient?.sendRaw(encoding.toUint8Array(encoder));
			}, this._resyncInterval as number);
		}

		const encoder = encoding.createEncoder();
		encoding.writeVarUint(encoder, messageSync);
		syncProtocol.writeSyncStep1(encoder, this.doc);
		this.wsClient?.sendRaw(encoding.toUint8Array(encoder));
		if (this.awareness.getLocalState() !== null) {
			const encoderAwarenessState = encoding.createEncoder();
			encoding.writeVarUint(encoderAwarenessState, messageAwareness);
			encoding.writeVarUint8Array(encoderAwarenessState, awarenessProtocol.encodeAwarenessUpdate(this.awareness, [this.doc.clientID]));
			this.wsClient?.sendRaw(encoding.toUint8Array(encoderAwarenessState));
		}
	};
}

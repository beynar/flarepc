<script lang="ts">
	import { onMount } from 'svelte';
	import * as Y from 'yjs';
	import { WebsocketProvider } from 'y-websocket';
	import { api, publicApi } from '../../api';
	import { DocProvider } from 'flarepc/yjs/client';
	let doc = $state<Y.Doc>();
	let presence = $state<any[]>([]);
	let text = $state<string>();
	onMount(async () => {
		const {
			awareness,
			doc: D,
			client
		} = await publicApi.TestDurable('test').doc(DocProvider, {
			disableBroadcast: true,
			debounceMs: 1000
		});

		presence = client.presence;
		doc = D;
		client.on('presence', (e) => {
			presence = e;
		});
		doc.getText('text').observe((e) => {
			text = D.getText('text').toString();
		});
		text = doc.getText('text').toString();
	});

	$effect(() => {
		console.log($state.snapshot(presence));
	});
</script>

<button
	onclick={async () => {
		const res = await publicApi.TestDurable('test').update();
		console.log(res);
	}}
>
	add text remote
</button>
<button
	onclick={async () => {
		doc?.getText('text').insert(0, doc?.getText('text').toString());
	}}
>
	add text
</button>
<button
	onclick={async () => {
		doc?.getText('text').delete(0, doc?.getText('text').length);
	}}
>
	delete
</button>
{#if doc}
	<div class="grid bg-slate-200 h-screen grid-cols-2 gap-4 p-10">
		{!text ? 'none' : text}
	</div>
{/if}

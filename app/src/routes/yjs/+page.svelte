<script lang="ts">
	import { onMount } from 'svelte';
	import * as Y from 'yjs';
	import { api, publicApi } from '../../api';
	import { DocProvider } from 'flarepc/yjs/client';
	let doc = $state<Y.Doc>();
	let presence = $state<any[]>([]);
	let text = $state<string>();
	onMount(async () => {
		const client = await publicApi.TestDurable('test').connect();
		const provider = new DocProvider(client);
		doc = provider.doc!;

		// const {
		// 	doc: D,
		// 	client
		// } = await publicApi.TestDurable('test').doc(DocProvider, {
		// 	disableBroadcast: true,
		// 	debounceMs: 1000
		// });

		presence = client.presence;
		client.on('presence', (e) => {
			presence = e;
		});
		doc.getText('text').observe((e) => {
			text = doc?.getText('text').toString();
		});
		text = doc?.getText('text').toString();
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
<button
	onclick={async () => {
		await publicApi.TestDurable('test').undo();
	}}
>
	undo remote
</button>
<button
	onclick={async () => {
		await publicApi.TestDurable('test').redo();
	}}
>
	redo remote
</button>
{#if doc}
	<div class="grid bg-slate-200 h-screen grid-cols-2 gap-4 p-10">
		{!text ? 'none' : text}
	</div>
{/if}

<button
	onclick={async () => {
		doc?.getText('text').insert(0, doc?.getText('text').toString());
	}}
>
	add text
</button>

<pre>{JSON.stringify({ text }, null, 2)}</pre>

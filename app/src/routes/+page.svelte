<script lang="ts">
	import { onMount } from 'svelte';
	import { api, publicApi, type API } from '../api';

	let ws = $state<API['TestDurable']['ws']>();

	onMount(async () => {
		const wes = await publicApi.TestDurable('test').connect({
			headers: {
				'client-id': 'client-id'
			},
			handlers: {
				message: ({ data, ctx }) => {
					console.log(data);
				},
				arn: {
					aud: ({ data, ctx }) => {
						console.log(data);
					}
				}
			}
		});
		wes.on('presence', (presence) => {
			console.log('presence');
		});
		ws = wes;
	});

	class Test {
		test: {
			test: string;
		};

		constructor() {
			this.test = {
				test: 'test'
			};
		}
	}

	const test = async () => {
		const [result, error] = await publicApi.TestDurable('test').test();

		if (error) {
			console.log({ error });
		} else {
			console.log({ result });
		}
	};
</script>

<img src="http://localhost:8080/[public]/static/test.png" alt="test" />

<div class="grid bg-slate-200 h-screen grid-cols-2 gap-4 p-10">
	<button
		class="shadow-md rounded-lg h-fit bg-white p-4"
		onclick={async () => {
			// const result = await api.text('ezaez');
			const [result2, error] = await publicApi.public('true');
			if (result2) {
				console.log(result2);
			} else {
				console.log({ error });
			}
		}}
	>
		Test procedure
	</button>
	<button
		class="shadow-md rounded-lg h-fit bg-white p-4"
		onclick={async () => {
			// const result = await api.text('ezaez');
			const [res] = await publicApi.caca.prout.vomi();
			console.log(res);
			// if (result2) {
			// 	console.log(result2);
			// } else {
			// 	console.log({ error });
			// }
		}}
	>
		Test excluded procedure
	</button>
	<button
		class="shadow-md rounded-lg h-fit bg-white p-4"
		onclick={async () => {
			const [result, error] = await publicApi.TestDurable('test').test();
			console.log({ result, error });
		}}
	>
		Test durable
	</button>
	<button
		class="shadow-md rounded-lg h-fit bg-white p-4"
		onclick={async () => {
			const result = await publicApi.TestDurable('test').test();
			console.log(result);
		}}
	>
		Test normal api
	</button>
	<button
		class="shadow-md rounded-lg h-fit bg-white p-4"
		onclick={async () => {
			if (!ws) return;

			const [result, error] = await ws?.send.message({ message: 'test' });
			if (error) {
				console.log({ error });
			} else {
				console.log({ result });
			}
		}}
	>
		test ws response
	</button>
	<button
		class="shadow-md rounded-lg h-fit bg-white p-4"
		onclick={async () => {
			const result = await api.TestDurable('test').validators.valibot({
				name: 'world',
				platform: 'android',
				versions: ['1', '2', '3']
			});
		}}
	>
		Error on valibot
	</button>
	<button
		class="shadow-md rounded-lg h-fit bg-white p-4"
		onclick={async () => {
			const result = await api.TestDurable('test').ai('coucou', ({ chunk }) => {
				console.log(chunk.choices[0].delta.content);
			});
		}}
	>
		Test ai stream output
	</button>
	<button
		class="shadow-md rounded-lg h-fit bg-white p-4"
		onclick={async () => {
			const result = await api.text('wcacaorld');
			console.log(result);
		}}
	>
		Test a normal procedure on the worker
	</button>
	<button
		class="shadow-md rounded-lg h-fit bg-white p-4"
		onclick={async () => {
			const activityGraph = document.querySelector('#activity-graph');
			const html = activityGraph?.outerHTML;
			const result = await api.TestDurable('test').test.test.test({
				id: ws?.presence[0].id!
			});
		}}
	>
		Test a normal procedure on the object
	</button>
	{#if ws}
		<button
			class="shadow-md rounded-lg h-fit bg-white p-4"
			onclick={async () => {
				const date = Date.now();
				console.log('send message', ws);
				const [result, error] = await ws!.send.message({
					message: date.toString()
				});
				console.log({ result, error });
				if (error) {
					console.log({ error });
				} else {
					console.log({ result });
				}
			}}
		>
			send message eaz
		</button>
	{/if}
</div>

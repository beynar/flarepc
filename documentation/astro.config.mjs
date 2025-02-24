// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

// https://astro.build/config
export default defineConfig({
  integrations: [
    starlight({
      title: "My Docs",
      social: {
        github: "https://github.com/withastro/starlight"
      },
      sidebar: [
        {
          label: "Flarepc",
          items: [
            // Each item here is one entry in the navigation menu.
            { label: "Introduction", slug: "introduction" }
            // { label: "Quick Start", slug: "/quick-start" },
            // {
            //   label: "Concepts",
            //   slug: "/concepts",
            //   items: [
            //     { label: "Server", slug: "/concepts/server" },
            //     { label: "Router", slug: "/concepts/router" },
            //     { label: "Procedure", slug: "/concepts/router" },
            //     { label: "Request Event", slug: "/concepts/router" },
            //     { label: "Locals", slug: "/concepts/router" }
            //   ]
            // }
          ]
        }
        // {
        //   label: "Worker server",
        //   items: [
        //     { label: "Your first server", slug: "/introduction" },
        //     { label: "Router", slug: "/quick-start" },
        //     { label: "Multi server worker", slug: "/quick-start" }
        //   ]
        // },
        // {
        //   label: "Durable server",
        //   items: [
        //     { label: "What is a durable server?", slug: "/introduction" },
        //     { label: "Defining a durable router", slug: "/quick-start" },
        //     { label: "Using websockets", slug: "/quick-start" }
        //   ]
        // },
        // {
        //   label: "Client usage",
        //   items: [
        //     { label: "Monorepo setup", slug: "/introduction" },
        //     { label: "Calling server procedures", slug: "/quick-start" },
        //     { label: "Calling durable procedures", slug: "/concepts" },
        //     { label: "Websocket connection", slug: "/concepts" }
        //   ]
        // }
      ]
    })
  ]
});

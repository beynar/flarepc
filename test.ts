const url_base = "http://localhost:8787/[app]/test";
const url = encodeURI("http://localhost:8787/[app]/test");
const url2 = encodeURIComponent("http://localhost:8787/[app]/test");
console.log({ url, url2 });

const url3 = decodeURI(url);
const url4 = decodeURI(url_base);
console.log({ url3, url4 });

// Run: node test.js
const assert = require("assert");
const { slug, template } = require("./shared.js");

assert.strictEqual(slug("  Solo Leveling: Ragnarok! "), "solo-leveling-ragnarok");

const r = template("example.com");
const url = "https://example.com/manga/solo-leveling/chapter-142.5/";
assert(new RegExp(r.match, "i").test(url));
assert.strictEqual(url.match(new RegExp(r.chapter.re, "i"))[1], "142.5");
assert.strictEqual("Solo Leveling - Chapter 142 | Example".match(new RegExp(r.series.re, "i"))[1], "Solo Leveling");
assert.strictEqual("One Piece Ch. 1100".match(new RegExp(r.series.re, "i"))[1], "One Piece");
assert(!new RegExp(r.match, "i").test("https://example.com/manga/solo-leveling/"));
console.log("ok");

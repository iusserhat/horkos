import { h } from "../lib/dom";

/** The English demo video (web/public/media). No autoplay; nothing loads until play is pressed. */
export function demoVideo(small = false) {
  return h(
    "figure",
    { class: `demo-frame${small ? " demo-small" : ""}` },
    h(
      "video",
      { controls: true, playsinline: true, preload: "none", poster: "./media/horkos-demo-poster.jpg", width: "1280", height: "720", "aria-label": "Horkos demo: an AI agent buys data on NEAR testnet, from order to Settled" },
      h("source", { src: "./media/horkos-demo-en.mp4", type: "video/mp4" }),
      h("a", { href: "./media/horkos-demo-en.mp4" }, "Download the demo video (MP4)"),
    ),
  );
}

export function demo() {
  return h(
    "section",
    { class: "section band band-butter", id: "demo", "aria-labelledby": "demo-title" },
    h(
      "div",
      { class: "wrap" },
      h("div", { class: "sec-head" }, h("p", { class: "eyebrow eb-white" }, "Demo, 2:14"), h("h2", { id: "demo-title" }, "See an order settle in 2 minutes"), h("p", { class: "lead" }, "A real agent buying real data on NEAR testnet, start to Settled.")),
      demoVideo(),
      h("p", { class: "demo-note muted" }, "Voice-over is synthetic (ElevenLabs)."),
    ),
  );
}

# PawPilot — Phase 0 Research Summary

**Date:** 2026-10-07
**Decision:** Niche = **Pets / pet care** (English) · Brand = **PawPilot** · Tagline: "Happy pets, confident owners."

---

## 1. Niche selection

Compared 9 niches (personal finance, AI tools & productivity, SaaS reviews, side hustles, home/DIY, health basics, travel, pets, tech how-tos) on: new-domain winnability × ad RPM × evergreen potential × AI-Overview resistance.

**Winner: PETS.**
- **Winnability (highest of all 9):** no credential moat; long-tail SERPs are forums/Reddit/mid-tier blogs a well-structured new domain can beat. A 2026 case study took a brand-new pet-health domain from ~100 to thousands of daily impressions with programmatic breed × symptom pages (e.g. "shih-tzu breathing difficulty" ranking positions ~6–9). Another new domain hit 176 organic visits/mo + 393 ranking keywords by month 8.
- **Monetization (acceptable):** display RPM ~$10–20 (Mediavine Journey avg $11.15); affiliate depth compensates — pet insurance $5–$100+/sale, Rover 15%, pet brands 8–20%, pet-insurance CPC ~$5.15.
- **Evergreen (excellent):** pet ownership is permanent and growing (~$232B market by 2027); slow content decay suits automation.
- **AI-Overview resistance (best available):** purchase-intent/experience queries resist summarization; transactional queries see ~1% AIO coverage vs 88%+ for informational. Hands-on testing content is what AI can't replicate.

**Runner-up:** home improvement/DIY (good RPM, evergreen) — but AI Overviews crushed DIY how-tos (one home/DIY publisher lost 70% traffic in 2 months).
**Avoid:** personal finance + health (YMYL, credential moats, 30–50% AIO coverage, fintech publisher traffic −12–18% in 2025), travel (independents shutting down — The Planet D −90%), AI tools (saturated, trend decay).

**Key 2025–2026 data:** Ahrefs (300k keywords, Feb 2026) — AI Overviews cut clicks to #1 organic by 58%; Seer Interactive — organic CTR −61% on AIO queries; Pew — CTR 15%→8%.

### Sub-categories (6)
1. **Dog Training & Behavior** — problem-solving posts ("why does my dog…", "how to stop…")
2. **Cat Care Essentials** — litter, feeding, enrichment, indoor-cat guides
3. **Breed Guides** — programmatic hub × trait/care pages (the proven wedge)
4. **Pet Health Basics** — preventive, non-diagnostic, vet-cited, always with disclaimer
5. **Product Reviews & Comparisons** — food, toys, beds, insurance; hands-on style testing notes
6. **Adventures with Pets** — travel, hiking, parks, pet-friendly places

Content mix per day: ~1 trending/news-jacking topic + ~2 evergreen high-intent topics.

---

## 2. Brand name

Suggested 5 (all checked against .com RDAP on 2026-10-07):
1. **PawPilot** ← PICKED. Short, memorable, implies expert guidance. (Exact .com taken.)
2. WagWise — warm and wise; exact .com taken.
3. PawPedia — descriptive "encyclopedia of pet care"; exact .com taken.
4. The Wag Report — editorial/newspaper feel; exact .com taken.
5. PawLore — knowledge/stories; exact .com taken.

**Domain honesty note:** 60+ clean pet .com candidates were checked via RDAP — the pet .com namespace is effectively saturated (all taken, mostly parked). Recommendation: try to acquire `pawpilot.com` on the aftermarket (Afternic/Sedo), otherwise register the best available variant at purchase time (registrar shows live availability) and set it as `SITE_URL` in env. The codebase treats the domain as configuration, brand "PawPilot" is used everywhere in copy/metadata/logo text.

---

## 3. Competitor teardown — replicable patterns

Studied: NerdWallet, Investopedia, Wirecutter, The Verge, Healthline, Ahrefs blog, Backlinko, Zapier blog (homepages verified live 2026-10-07).

**Copy these:**
1. Disclosure/affiliate banner above the fold (NerdWallet, Wirecutter)
2. Triple bylines (written / reviewed / edited) + "Fact checked" + visible update dates
3. Key Takeaways box near the top (Investopedia)
4. Auto table of contents with jump links
5. Methodology section on review/comparison posts (how we tested)
6. Hub-and-spoke topic clusters + A–Z style index pages for internal linking
7. FAQ sections targeting People-Also-Ask questions (+ FAQPage schema)
8. Comparison tables with clear pick hierarchy (Wirecutter)
9. Free tools as link magnets (calculators, quizzes — phase 2)
10. Every health claim cited to a primary/vet source (Healthline model)
11. Newsletter capture as zero-click hedge (Backlinko, Zapier)
12. Author pages with credentials + About page with editorial policy (E-E-A-T)
13. Descriptive, keyword-rich anchor text for internal links
14. "The Bottom Line" style conclusion
15. Update dates on evergreen content; content refresh cadence

**Avoid:**
- Heavy display ads on a new domain — monetize trust first (Wirecutter/Ahrefs run zero display ads)
- Undated content; treating schema as a growth lever (Google 2025: no special schema needed for AI features; implement Organization/Article/FAQPage/BreadcrumbList once as hygiene)
- Thin affiliate pages with no original testing angle

**Implemented in this build:** disclosure banner, bylines + reviewed-by + update dates, Key Takeaways box, auto TOC, methodology block on reviews, related-posts hub linking, FAQ + FAQPage schema, comparison-table component, author pages, editorial/privacy/terms/disclaimer pages, newsletter capture, sitemap/RSS/robots, IndexNow on publish.

---

## 4. SEO/content strategy for the agent pipeline

- Target long-tail, high-intent keywords (breed × issue, product × comparison, "how to" problem posts); avoid head terms.
- Every post: 1500–1800 words, 1 H1, H2/H3 hierarchy, 3–5 internal links, 1–3 authoritative external links (vet schools, AKC, manufacturer pages), FAQ (3–5 Qs), key takeaways, meta title ≤60 / description ≤155.
- Pet Health Basics posts: preventive-care only, cite veterinary sources, visible disclaimer, never diagnose.
- Deduplicate semantically against existing posts before writing (no keyword cannibalization).
- Publish cadence: 3/day at admin-configured times (default Asia/Karachi); weekly refresh pass on older posts (toggle).

// PawPilot database seed. Idempotent: safe to re-run.
// Usage:
//   npm run db:seed -- --core-only   # categories + author + pages only
//   npm run db:seed                  # also generates the 5 fixed evergreen posts
//                                    # via the Phase C pipeline (lib/agent/pipeline.ts)

import { db } from '../lib/db';
import { slugify } from '../lib/format';
import type { AgentPipeline, FixedTopic } from '../lib/agent/types';

const CATEGORIES: Array<{ slug: string; name: string; description: string }> = [
  {
    slug: 'dog-training',
    name: 'Dog Training & Behavior',
    description:
      'Practical, reward-based answers to the everyday dog behavior questions owners actually ask — from puppy biting and barking to leash manners and separation anxiety.',
  },
  {
    slug: 'cat-care',
    name: 'Cat Care Essentials',
    description:
      'The fundamentals of a happy indoor cat: litter box habits, feeding, scratching, play, and enrichment — explained in plain language with vet-aligned guidance.',
  },
  {
    slug: 'breed-guides',
    name: 'Breed Guides',
    description:
      'Honest breed profiles and head-to-head comparisons covering temperament, exercise needs, grooming, health, and who each breed is really right for.',
  },
  {
    slug: 'pet-health',
    name: 'Pet Health Basics',
    description:
      'Preventive care every owner should know — dental hygiene, parasites, vaccinations, and spotting early warning signs. Always non-diagnostic; your vet has the final word.',
  },
  {
    slug: 'product-reviews',
    name: 'Product Reviews & Comparisons',
    description:
      'Hands-on style reviews and clear comparisons of pet food, toys, beds, and gear — how we evaluate, who each pick suits, and what to skip.',
  },
  {
    slug: 'adventures',
    name: 'Adventures with Pets',
    description:
      'Travel, hiking, parks, and pet-friendly places: how to plan outings your pet will actually enjoy, and what to pack so nothing goes wrong.',
  },
];

const AUTHOR = {
  slug: 'maya-khan',
  name: 'Maya Khan',
  role: 'Founder & Contributor',
  bio: 'Maya Khan is a pet-care writer with 8 years of hands-on experience fostering dogs and cats of all ages, from bottle-fed kittens to senior rescues. She writes practical, jargon-free guides based on real life with animals — what worked, what did not, and when to call the vet. Her work focuses on preventive care, humane training, and helping new owners feel confident from day one.',
  credentials:
    '8 years fostering dogs and cats; pet-care writer covering training, nutrition basics, and preventive health.',
};

const PAGES: Array<{
  slug: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  contentHtml: string;
}> = [
  {
    slug: 'about',
    title: 'About PawPilot',
    metaTitle: 'About PawPilot — Happy pets, confident owners',
    metaDescription:
      'PawPilot publishes practical, vet-aligned pet care guides: training, cat care, breed guides, health basics, and honest product reviews.',
    contentHtml: `<h2>Happy pets, confident owners.</h2>
<p>PawPilot is an independent pet-care publication. We write the guides we wish every new pet owner had on day one: clear, practical, and grounded in real life with animals — not theory.</p>
<h2>What we publish</h2>
<p>Our coverage spans six areas: <strong>dog training &amp; behavior</strong>, <strong>cat care essentials</strong>, <strong>breed guides</strong>, <strong>pet health basics</strong>, <strong>product reviews &amp; comparisons</strong>, and <strong>adventures with pets</strong>. Every article is written to answer one question completely, with actionable steps you can use the same day.</p>
<h2>How we work</h2>
<p>Health content is preventive and non-diagnostic, aligned with veterinary guidance, and always carries a clear disclaimer: nothing here replaces your veterinarian. Product coverage explains how we evaluate and who each pick suits — we would rather recommend nothing than recommend the wrong thing.</p>
<h2>Who writes it</h2>
<p>PawPilot was founded by <strong>Maya Khan</strong>, a pet-care writer with 8 years of hands-on experience fostering dogs and cats. Every article is written or reviewed with the same standard: would this genuinely help a real owner and their pet?</p>`,
  },
  {
    slug: 'privacy',
    title: 'Privacy Policy',
    metaTitle: 'Privacy Policy — PawPilot',
    metaDescription:
      'How PawPilot collects and uses data: newsletter emails, contact messages, and basic analytics. We never sell your personal information.',
    contentHtml: `<h2>Privacy Policy</h2>
<p>Last updated: October 2026. PawPilot ("we") respects your privacy. This policy explains what we collect and why.</p>
<h2>What we collect</h2>
<ul>
<li><strong>Newsletter signup:</strong> your email address, used only to send the newsletter you asked for. Unsubscribe anytime via the link in any email.</li>
<li><strong>Contact form:</strong> your name, email, and message, used only to respond to you.</li>
<li><strong>Analytics:</strong> aggregated, anonymized page-view counts to understand which articles help readers. We do not build personal profiles.</li>
</ul>
<h2>What we never do</h2>
<p>We never sell, rent, or share your personal information with advertisers or data brokers.</p>
<h2>Cookies</h2>
<p>We use only the technical storage needed for the site to function (for example, admin sessions). We do not run third-party advertising trackers.</p>
<h2>Your rights</h2>
<p>You may ask for a copy of the data we hold about you, or ask us to delete it, by contacting us through the contact page. We respond to all requests.</p>
<h2>Changes</h2>
<p>If this policy changes materially, we will note the new date above and, where appropriate, highlight the change on the site.</p>`,
  },
  {
    slug: 'terms',
    title: 'Terms of Use',
    metaTitle: 'Terms of Use — PawPilot',
    metaDescription:
      'The terms governing your use of PawPilot: content use, affiliate disclosure, and limitations of liability.',
    contentHtml: `<h2>Terms of Use</h2>
<p>Last updated: October 2026. By using PawPilot you agree to these terms.</p>
<h2>Content</h2>
<p>All articles are for general information and education. You may share links to our content freely. Republishing full articles without written permission is not allowed; short quotes with attribution and a link are welcome.</p>
<h2>Affiliate disclosure</h2>
<p>Some articles contain affiliate links. If you buy through them, we may earn a commission at no extra cost to you. This never influences what we recommend — our editorial judgment is independent.</p>
<h2>No professional advice</h2>
<p>Pet health content is preventive and informational only. It is not veterinary advice, diagnosis, or treatment. Always consult a qualified veterinarian about your pet's health. See our <a href="/disclaimer">Disclaimer</a>.</p>
<h2>Liability</h2>
<p>We work hard to keep information accurate and current, but we make no warranties about completeness or results. Use of the site is at your own risk; to the fullest extent permitted by law, PawPilot is not liable for decisions you make based on our content.</p>
<h2>Changes</h2>
<p>We may update these terms; continued use of the site after changes means you accept them.</p>`,
  },
  {
    slug: 'disclaimer',
    title: 'Disclaimer',
    metaTitle: 'Disclaimer — PawPilot',
    metaDescription:
      'PawPilot content is educational and non-diagnostic. Always consult a qualified veterinarian about your pet’s health.',
    contentHtml: `<h2>Disclaimer</h2>
<h2>Pet health content is not veterinary advice</h2>
<p>Articles in <strong>Pet Health Basics</strong> and any other health-related content on PawPilot are for general education and preventive-care information only. They do <strong>not</strong> diagnose conditions, prescribe treatment, or replace professional veterinary advice, diagnosis, or treatment.</p>
<p>Every animal is different. If your pet shows signs of illness, pain, injury, or a sudden behavior change — or if you are unsure about anything health-related — <strong>contact a qualified veterinarian promptly</strong>. Never delay seeking professional care because of something you read here, and never disregard your vet's guidance in favor of general information online.</p>
<h2>Emergencies</h2>
<p>If you believe your pet is having a medical emergency (difficulty breathing, collapse, seizures, poisoning, severe bleeding), contact your veterinarian or an emergency animal clinic immediately.</p>
<h2>Training and products</h2>
<p>Training guidance describes humane, reward-based methods that work for most pets, but individual results vary. Product reviews reflect our evaluation at the time of writing; always check current manufacturer guidance, sizing, and safety warnings before use.</p>
<h2>Affiliates</h2>
<p>Some links on PawPilot are affiliate links, which may earn us a commission at no cost to you. See our <a href="/terms">Terms of Use</a> for the full disclosure.</p>`,
  },
  {
    slug: 'contact',
    title: 'Contact PawPilot',
    metaTitle: 'Contact PawPilot',
    metaDescription:
      'Get in touch with PawPilot: questions, feedback, corrections, or partnership inquiries. We usually reply within 2 business days.',
    contentHtml: `<h2>We would love to hear from you</h2>
<p>Questions about an article, a correction to report, or an idea for a guide we should write? Send us a message with the form below — we read everything and usually reply within 2 business days.</p>
<h2>What to include</h2>
<p>For corrections, please include the article title or URL and what looks wrong. For topic ideas, tell us about your pet and the question you are trying to answer — the more specific, the better the guide we can write.</p>
<h2>Emergencies</h2>
<p>If your pet needs urgent help, please contact your veterinarian or an emergency animal clinic right away — this form is not monitored for emergencies.</p>`,
  },
];

const FIXED_TOPICS: FixedTopic[] = [
  {
    keyword: 'how to stop a puppy from biting',
    secondaryKeywords: ['puppy biting hands', 'puppy nipping training', 'stop puppy mouthing'],
    searchIntent: 'informational',
    categorySlug: 'dog-training',
    angle: 'Step-by-step humane plan for mouthy puppies: why they bite, redirection, bite-inhibition games, and when it is a red flag.',
    rationale: 'High-volume evergreen problem query; strong fit for the training category and PawPilot tone.',
  },
  {
    keyword: 'how often should you clean a cat litter box',
    secondaryKeywords: ['litter box cleaning schedule', 'scoop cat litter how often', 'cat litter box hygiene'],
    searchIntent: 'informational',
    categorySlug: 'cat-care',
    angle: 'Clear scooping and full-change schedule by household size, plus the health and behavior reasons cats care so much.',
    rationale: 'Perennial beginner question with clear, citable best practice; low competition for a thorough answer.',
  },
  {
    keyword: 'labrador vs golden retriever: which family dog fits you',
    secondaryKeywords: ['labrador vs golden retriever temperament', 'lab vs golden family dog', 'golden retriever vs labrador differences'],
    searchIntent: 'commercial investigation',
    categorySlug: 'breed-guides',
    angle: 'Honest head-to-head on energy, training, shedding, health, and lifestyle fit — with a decision framework, not a winner.',
    rationale: 'Classic high-intent comparison; ideal anchor for the breed-guides hub-and-spoke cluster.',
  },
  {
    keyword: "how to brush your dog's teeth at home",
    secondaryKeywords: ['dog teeth brushing guide', 'brush dog teeth without stress', 'dog dental care at home'],
    searchIntent: 'informational',
    categorySlug: 'pet-health',
    angle: 'Preventive dental routine: tools, desensitization steps over 2 weeks, technique, and warning signs that need a vet.',
    rationale: 'Preventive-care staple; non-diagnostic, vet-aligned, pairs naturally with the site disclaimer.',
  },
  {
    keyword: 'best indestructible dog toys for aggressive chewers',
    secondaryKeywords: ['tough dog toys power chewers', 'indestructible toys for dogs that destroy everything', 'durable chew toys large dogs'],
    searchIntent: 'commercial investigation',
    categorySlug: 'product-reviews',
    angle: 'Comparison with a clear testing methodology: what "indestructible" really means, safety notes, and picks by chew style.',
    rationale: 'High purchase intent with affiliate depth; methodology section matches the editorial standard.',
  },
];

async function seedCore(): Promise<void> {
  for (const c of CATEGORIES) {
    await db.category.upsert({
      where: { slug: c.slug },
      create: c,
      update: { name: c.name, description: c.description },
    });
  }
  console.log(`categories: ${CATEGORIES.length} upserted`);

  await db.author.upsert({
    where: { slug: AUTHOR.slug },
    create: AUTHOR,
    update: {
      name: AUTHOR.name,
      bio: AUTHOR.bio,
      role: AUTHOR.role,
      credentials: AUTHOR.credentials,
    },
  });
  console.log('author: maya-khan upserted');

  for (const p of PAGES) {
    await db.page.upsert({
      where: { slug: p.slug },
      create: p,
      update: {
        title: p.title,
        contentHtml: p.contentHtml,
        metaTitle: p.metaTitle,
        metaDescription: p.metaDescription,
      },
    });
  }
  console.log(`pages: ${PAGES.length} upserted`);
}

async function seedFixedPosts(): Promise<void> {
  // Phase C implements this module. The non-literal import keeps tsc happy
  // when the file does not exist yet; tsx resolves it at runtime.
  const pipelinePath = '../lib/agent/pipeline';
  let pipeline: AgentPipeline;
  try {
    const mod = (await import(pipelinePath)) as { pipeline: AgentPipeline };
    pipeline = mod.pipeline;
  } catch (err) {
    console.error(
      `Cannot load ${pipelinePath}: ${(err as Error).message}\n` +
        'Run with --core-only, or implement Phase C first.',
    );
    process.exit(1);
  }
  if (!pipeline || typeof pipeline.generatePost !== 'function') {
    console.error(`${pipelinePath} does not export a valid pipeline.`);
    process.exit(1);
  }

  for (const topic of FIXED_TOPICS) {
    const slugBase = slugify(topic.keyword);
    // The pipeline derives the final slug from the generated SEO title, so it
    // may carry a suffix (e.g. "-a-practical-guide"). Match on the base prefix
    // to keep re-runs idempotent.
    const existingPost = await db.post.findFirst({ where: { slug: { startsWith: slugBase } } });
    if (existingPost) {
      console.log(`skip (post exists): ${topic.keyword} -> ${existingPost.slug}`);
      continue;
    }
    const usedTopic = await db.topicQueue.findFirst({
      where: { keyword: topic.keyword, status: 'used' },
    });
    if (usedTopic) {
      console.log(`skip (topic used): ${topic.keyword}`);
      continue;
    }
    const summary = await pipeline.generatePost(topic).catch((err: unknown) => {
      console.error(`FAILED topic "${topic.keyword}": ${(err as Error).message}`);
      return null;
    });
    if (summary) {
      console.log(`created: ${summary.title} (${summary.wordCount} words, qa ${summary.qaScore})`);
    }
  }
}

async function main(): Promise<void> {
  const coreOnly = process.argv.includes('--core-only');
  await seedCore();
  if (coreOnly) {
    console.log('core-only: skipping fixed post generation');
  } else {
    await seedFixedPosts();
  }
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });

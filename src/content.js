// Everything a visitor reads lives here: the start card, the relics (projects and experience),
// the skill constellation and the Oracle's scripted lines. Edit this file to change the site's words.

export const ABOUT = { id:'about', kicker:'Start here', color:'#78E6F0', title:'Austin Ma', meta:'Computer Science · University of Waterloo',
  body:'I build data pipelines and AI tools that people actually use. My work drifts above this valley as sealed relics. Click one to shoot it down, draw the bow yourself, or ask the Oracle.',
  tags:['Python','TypeScript','Swift','Data engineering','AI apps'] };
export const RELICS = [
  { id:'watapply', key:1, name:'WatApply', kicker:'AI co-op application agent', color:'#78E6F0', meta:'Aug 2026 – Present', form:'letter',
    body:'A local AI app for Waterloo co-op applications. It finds evidence in your own materials, drafts tailored applications, and never submits anything without your exact approval.',
    tags:['LangGraph','FastAPI','React','PostgreSQL','pgvector'], orbit:{ R:11, y:38, speed:.07, phase:.4 } },
  { id:'suwudu', key:2, name:'SuWuDu', kicker:'Desktop pet & focus companion', color:'#F2A2C4', meta:'Jul – Sep 2026', form:'cocoon',
    body:'A pixel pet that lives on your desktop and keeps you company while you focus, with focus and journal tracking and an AI chat that can see your screen. Native Swift on macOS, C#/WPF on Windows.',
    tags:['Swift','SwiftUI','AppKit','C#','WPF'], orbit:{ R:17, y:30, speed:-.055, phase:1.6 } },
  { id:'aquanow', key:3, name:'Aquanow', kicker:'Data Engineer Intern', color:'#E8B866', meta:'May – Aug 2026 · Internship', form:'iceberg',
    body:'Built scheduled Python ingestion that syncs FX trades, balances and positions into Apache Iceberg tables on AWS, a PySpark/Glue raw-to-clean pipeline, and overnight-swap reports validated against statements.',
    tags:['Python','PySpark','AWS Glue','Iceberg','Athena','Terraform'], orbit:{ R:14, y:25, speed:.06, phase:2.9 } },
  { id:'nexo', key:4, name:'NEXO', kicker:'Research workspace · team project', color:'#8FA8FF', meta:'Jul 2026 – Present', form:'book',
    body:'A source-grounded research workspace for the humanities and social sciences. My part: the PDF viewer and annotation feature, and a sturdier data crawler with rate-limit backoff, target filtering and export reports.',
    tags:['PDF annotation','Crawler','Data pipelines'], orbit:{ R:19, y:41, speed:-.045, phase:4.1 } },
  { id:'stablewake', key:5, name:'StableWake', kicker:'Mobile prototype · in progress', color:'#B9A2F5', meta:'Prototype · 2026', form:'hourglass',
    body:'A sleep-and-wake prototype. The phone turns audio into short local summaries and throws the raw recording away, with an iOS AlarmKit alarm as a deadline backup.',
    tags:['React Native','Expo','TypeScript','Swift'], orbit:{ R:9, y:31, speed:-.08, phase:5.2 } },
  { id:'signal', key:6, name:'Skills & contact', kicker:'The astrolabe', color:'#E2BE7A', meta:'Always in the top bar too', form:'astrolabe',
    body:'Languages: Python, TypeScript, Swift, C#, Java, SQL. Data: Spark, AWS Glue, Athena, Iceberg, Kafka. AI: LangGraph, LangChain, retrieval. The résumé, GitHub and LinkedIn links stay in the top bar the whole time.',
    tags:['Python','TypeScript','Swift','Spark','AWS','LangGraph'], orbit:{ R:21, y:34, speed:.04, phase:3.4 } },
  { id:'offclock', key:7, name:'Off the clock', kicker:'Hidden relic', color:'#6FF0C0', meta:'What I do for fun', form:'die', secret:true,
    body:'Strategy and social-deduction board games like Avalon, Blood on the Clocktower and Ark Nova, plus chess and poker. Lately I have been reading up on motorsport history.',
    tags:['Board games','Chess','Poker','Motorsport'], orbit:{ R:6, y:18, speed:.09, phase:0 } },
];

// Scripted Oracle answers for the prototype. Each intent matches keywords and may summon a relic by id.
export const INTENTS = [
  { k:['watapply','job agent','co-op compass','coop compass','waterlooworks','application agent'], to:'watapply',
    a:"WatApply is Austin's current build, started in August 2026. A local AI app for Waterloo co-op applications: it finds evidence in your own materials, drafts tailored applications and never submits without your exact approval. LangGraph, FastAPI, React, PostgreSQL with pgvector. I've brought the letter down to you." },
  { k:['suwudu','pixelheart','pet','pixel','focus'], to:'suwudu',
    a:"SuWuDu is a pixel pet that lives on your desktop and keeps you company while you focus. Austin built it natively twice, Swift for macOS and C#/WPF for Windows. The creature in that cocoon is it." },
  { k:['stablewake','stable wake','sleep','alarm','wake'], to:'stablewake',
    a:"StableWake is a sleep-and-wake prototype Austin is still building. The phone summarizes audio locally and discards the raw recording, with an iOS alarm as a deadline backup." },
  { k:['nexo','research','crawler','pdf'], to:'nexo',
    a:"NEXO is a team research workspace for the humanities and social sciences. Austin built its PDF viewer and annotations and made the data crawler sturdier." },
  { k:['aquanow','intern','experience','job','实习','工作','data engineer','pipeline'], to:'aquanow',
    a:"Austin spent Summer 2026 at Aquanow as a Data Engineer Intern. He built Python and PySpark pipelines that land trades, balances and positions in Apache Iceberg on AWS, and reports checked against real statements." },
  { k:['hobby','hobbies','fun','free time','board game','game','爱好'], to:'offclock',
    a:"Off the clock, Austin plays strategy and social-deduction board games, chess and poker." },
  { k:['skill','stack','tech','language','know','技能','擅长'], to:'signal',
    a:"Day to day Austin writes Python, TypeScript and Swift, with C#, Java and SQL when needed. He's strongest in data pipelines (Spark, AWS Glue, Athena, Iceberg) and AI apps (LangGraph and retrieval). The astrolabe holds the rest." },
  { k:['contact','hire','email','reach','linkedin','resume','résumé','cv','联系','简历'], to:'signal',
    a:"The quickest way is the top bar: the résumé, GitHub and LinkedIn are always there. The astrolabe carries them too." },
  { k:['project','built','build','made','portfolio','work','项目','做过'], to:'watapply',
    a:"Six relics drift above this valley: WatApply, SuWuDu, Aquanow, NEXO, StableWake and the astrolabe of skills. If you only open one, open WatApply. I'll bring it to you." },
  { k:['star','stars','constellation','sky','light','星'], to:null,
    a:"Each relic you open gives me back a little light, and the skills it used wake as stars overhead. Projects that share a skill are joined by a line. Press C to look up, and touch a star to ask what it is." },
  { k:['waterloo','school','study','student','university','education','degree'], to:null,
    a:"Austin studies Computer Science at the University of Waterloo. Click his name in the top bar for the short introduction." },
  { k:['who','about','austin','yourself','介绍'], to:null,
    a:"Austin Ma is a Computer Science student at Waterloo who builds data pipelines and AI tools. His work drifts above you, sealed. Shoot a relic down, or name one and I'll bring it." },
  { k:['hello','hi','hey','你好','嗨'], to:null, a:"Welcome, wanderer. Name any of Austin's work and I'll bring it down, or try the bow yourself." },
];
export const FALLBACK = { to:null, a:"I only keep Austin's story here. Ask about his projects, his internship at Aquanow or his skills." };

// The skill constellation. Each star wakes when one of its relics is opened; relics that share a star are joined by lines.
// `relics` lists every relic whose text above names the skill (the astrolabe, id 'signal', is Austin's own skills list).
// `group` places the star in a region of the sky: lang, data, ai, apps, research, play.
export const SKILLS = [
  { id:'python',     name:'Python',            group:'lang',     relics:['watapply','aquanow','signal'], also:['pyspark'] },
  { id:'typescript', name:'TypeScript',        group:'lang',     relics:['stablewake','signal'], also:['ts'] },
  { id:'swift',      name:'Swift',             group:'lang',     relics:['suwudu','stablewake','signal'] },
  { id:'csharp',     name:'C#',                group:'lang',     relics:['suwudu','signal'], also:['c sharp','csharp'] },
  { id:'java',       name:'Java',              group:'lang',     relics:['signal'] },
  { id:'sql',        name:'SQL',               group:'lang',     relics:['signal'] },
  { id:'spark',      name:'Spark · PySpark',   group:'data',     relics:['aquanow','signal'], also:['spark','pyspark'] },
  { id:'aws',        name:'AWS · Glue · Athena', group:'data',   relics:['aquanow','signal'], also:['aws','glue','athena','amazon'] },
  { id:'iceberg',    name:'Apache Iceberg',    group:'data',     relics:['aquanow','signal'], also:['iceberg'] },
  { id:'kafka',      name:'Kafka',             group:'data',     relics:['signal'] },
  { id:'terraform',  name:'Terraform',         group:'data',     relics:['aquanow'] },
  { id:'pipelines',  name:'Data pipelines',    group:'data',     relics:['aquanow','nexo'], also:['pipeline','etl'] },
  { id:'langgraph',  name:'LangGraph',         group:'ai',       relics:['watapply','signal'] },
  { id:'langchain',  name:'LangChain',         group:'ai',       relics:['signal'] },
  { id:'retrieval',  name:'Retrieval · pgvector', group:'ai',    relics:['watapply','signal'], also:['retrieval','rag','pgvector','vector'] },
  { id:'fastapi',    name:'FastAPI',           group:'ai',       relics:['watapply'] },
  { id:'postgres',   name:'PostgreSQL',        group:'ai',       relics:['watapply'], also:['postgres','postgresql'] },
  { id:'react',      name:'React',             group:'apps',     relics:['watapply'] },
  { id:'reactnative',name:'React Native · Expo', group:'apps',   relics:['stablewake'], also:['react native','expo'] },
  { id:'swiftui',    name:'SwiftUI · AppKit',  group:'apps',     relics:['suwudu'], also:['swiftui','appkit'] },
  { id:'wpf',        name:'WPF',               group:'apps',     relics:['suwudu'] },
  { id:'pdf',        name:'PDF annotation',    group:'research', relics:['nexo'], also:['pdf','annotation'] },
  { id:'crawler',    name:'Crawler',           group:'research', relics:['nexo'], also:['crawler','scraper'] },
  { id:'boardgames', name:'Board games',       group:'play',     relics:['offclock'], also:['board game','avalon','clocktower','ark nova'] },
  { id:'chess',      name:'Chess',             group:'play',     relics:['offclock'] },
  { id:'poker',      name:'Poker',             group:'play',     relics:['offclock'] },
  { id:'motorsport', name:'Motorsport',        group:'play',     relics:['offclock'] },
];

// What the Oracle says about a star. `names` are the relics that use it (the astrolabe left out); `sealed` counts the ones still unopened.
export function starLine(skill, names, sealed){
  if (!names.length) return `${skill.name} is one of Austin's skills. The astrolabe lists it with the rest.`;
  const list = names.length === 1 ? names[0] : names.slice(0,-1).join(', ') + ' and ' + names[names.length-1];
  const still = names.length === 1 ? 'It is' : sealed === 1 ? 'One of them is' : sealed === names.length ? 'They are all' : `${sealed} of them are`;
  return `${skill.name} runs through ${list}.` + (sealed ? ` ${still} still sealed in the sky.` : '');
}

// The Oracle's own lines.
export const LINES = {
  intro: "I am the light of this valley, broken into six relics. Each holds a piece of Austin's work. Click one and your bow will bring it down, draw the bow yourself with F, or name one and I'll call it.",
  asleep: "That relic is still asleep beneath the lake. Light the four braziers on the stairs and it will wake.",
  woke: "The lake has given up its relic. Shoot it down, or press 7.",
  darkStar: "That star is still dark. Open a relic that uses it and it will wake.",
  lightBack: (n, stars) => `A beam of light returns · ${n} of 6` + (stars ? ` · ${stars} new star${stars === 1 ? '' : 's'} overhead` : ''),
  hiddenStars: stars => `The hidden relic's stars wake · ${stars} new`,
  finale: "Every relic is open and my light is whole again. Thank you for walking the whole valley. If you'd like to talk with Austin, his résumé, GitHub and LinkedIn are right here.",
};
export const FINALE = { id:'finale', kicker:'All six relics opened', color:'#F4D58D', title:'The valley is lit', meta:'Thanks for exploring',
  body:"You've opened every relic: Austin's internship at Aquanow, the apps he has built, and the skills that tie them together. The quickest way to reach him is below.",
  tags:[] };

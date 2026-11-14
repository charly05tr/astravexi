# Challenge page and existing solutions for autonomous astronaut health monitoring

Research date: 2026-11-14. Coverage is partial (see Gaps). Several items below come from search-engine summaries of pages, not from reading the pages directly; those are marked "(search summary)".

## 1. What the NASA Space Apps 2026 "Health Monitoring Software" challenge asks

### Takeaway
I could NOT read the challenge page. The fetch failed with a TLS error ("unable to get local issuer certificate"). I did not retry with certificate checks disabled, because that was blocked. No objective text, resources list or judging hints were captured. A teammate should open the page in a browser and paste its text.

### Cited Findings
- Target URL (unread): [Challenge page](https://www.spaceappschallenge.org/2026/challenges/health-monitoring-software/)
- A web search for mirrors/summaries of this challenge was blocked by the tool permission layer, so no secondary summary was obtained.

### Inferences
- The task brief (autonomous monitoring, preventive recommendations, delayed Earth comms) is the user's framing; it is not confirmed against the official page.

### Gaps
- Full objectives, background, considerations, Resources tab URLs, judging hints: all unavailable. Highest-priority item for manual retrieval.

## 2. NASA programs addressing this

### Takeaway
NASA's Human Research Program, via the Exploration Medical Capability (ExMC) element, frames the problem as Earth-Independent Medical Operations (EIMO), a gradual move toward crew medical autonomy. The most recent public AI effort is the Google/NASA CMO-DA proof of concept (Aug 2025), which is a clinical decision support tool, not a preventive routine coach.

### Cited Findings
- ExMC developed a model-based Concept of Operations for EIMO as an initial recommendation for gradually and safely enabling crew autonomy for Mars and beyond; distance from Earth is cited as the primary hazard driving the shift. Communication delay up to 24 min one-way for Mars — [NASA NTRS EIMO/capability-gap results](https://ntrs.nasa.gov/api/citations/20230007411/downloads/AsMA%202023%20Medical%20Capability%20Gaps%20and%20Roadmap.pdf) (search summary)
- NASA decadal paper: exploration missions will need an automated system to track medical consumables and equipment — [NTRS decadal topical paper](https://ntrs.nasa.gov/api/citations/20210023828/downloads/Decadal%20Topical%20-%20Development%20of%20Medical%20Capabilities%20and%20Technologies_New%20Graphic.docx.pdf) (search summary)
- Capability gap areas named in NASA slides include autonomous psychotherapy modality development and autonomous behavioral health aid operations — [NTRS 2023 gaps and roadmap](https://ntrs.nasa.gov/api/citations/20230007411/downloads/AsMA%202023%20Medical%20Capability%20Gaps%20and%20Roadmap.pdf) (search summary)
- A 2025 NASA summary of EIMO technical interchange meetings targets a capability gap analysis, an integrated EIMO roadmap, a ConOps and requirements for a Mars-level medical system (primary target: Transit Habitat) — [NTRS IWS 2025 EIMO TIMs summary](https://ntrs.nasa.gov/api/citations/20250000057/downloads/IWS%202025%20EIMO%20TIMs%20Summary.pdf) (search summary)
- CMO-DA: Google Cloud blog of Aug 7, 2025 (Jim Kelly, Google Public Sector) describes a joint Google/NASA proof of concept for a Clinical Decision Support System for extended spaceflight when a physician is not onboard or comms are limited. It is multimodal, "trained on spaceflight literature", supports analysis of crew health and performance, and is designed to support a crew medical officer or flight surgeon, not replace them. Outputs were scored with the OSCE framework. Results described only as "early" and "promising", with no accuracy numbers, sample sizes or architecture details — [Google Cloud blog](https://cloud.google.com/blog/topics/public-sector/how-google-and-nasa-are-testing-ai-for-medical-care-in-space)
- Search summaries add: runs on Google Vertex AI, NASA owns the source code, accepts speech/text/images, tested on simulated cases (ankle injury, flank pain, ear pain); work involved NASA's Lunar Command and Control Interoperability project and HRP — [Space.com](https://www.space.com/technology/nasa-and-google-test-ai-medical-assistant-for-astronaut-missions-to-the-moon-and-mars) and [TechCrunch](https://www.techcrunch.com/2025/08/08/nasa-and-google-are-building-an-ai-medical-assistant-to-keep-mars-bound-astronauts-healthy/) (search summary; Space.com page body was not readable). Note: the Google blog fetch did not confirm these details; treat as lower confidence.
- A Revolgy blog presents CMO-DA as acting autonomously, which exceeds what Google states — [Revolgy](https://www.revolgy.com/insights/blog/google-ai-becomes-nasa-first-doctor-for-deep-space-missions) (search summary; disputed framing)
- Mars one-way delay 4-24 min (another source: 3-21 min with total blackout periods); Mars medevac ruled out by 6-9 month transit — [SpaceCHI 2025 paper](https://drops.dagstuhl.de/storage/01oasics/oasics-vol130-spacechi2025/html/OASIcs.SpaceCHI.2025.33/OASIcs.SpaceCHI.2025.33.html) (search summary)

### Inferences
- CMO-DA targets diagnosis/treatment after symptoms are reported. Nothing found shows it doing proactive routine optimisation (sleep, exercise, nutrition). That is a plausible differentiation space, but I did not verify its absence.
- IMM/MEDPRAT, HRP Human Research Roadmap and Spaceflight Medical System concepts were requested but not researched (no sources fetched).

### Gaps
- Not researched: IMM/MEDPRAT, Human Research Roadmap risk pages, NASA CHP systems.
- No NASA-primary page on CMO-DA was read.

## 3. Other agencies, companies and research groups

### Takeaway
Wearable sensing is mature (CSA Astroskin/Hexoskin, Apple Watch on Inspiration4, Empatica). Autonomous interpretation and recommendation is still at research/proof-of-concept stage (ANU digital twins, WVU digital twins, TrialX HERMES).

### Cited Findings
- CSA Astroskin Bio-Monitor: smart shirt plus tablet app measuring heart and breathing rate, ECG, blood pressure, skin temperature, activity, blood oxygen. Built by Carré Technologies (Hexoskin's maker). CSA contract of $2.4M over 18 months (2016). Tested by David Saint-Jacques on ISS 2018-19. Data is downloaded to Earth via station comms. Sources disagree on launch/operation date; treat 2019 as approximate — [CSA](https://asc-csa.gc.ca/eng/sciences/astroskin.asp), [CSA 2016 release](https://www.canada.ca/en/space-agency/news/2016/10/new-advances-innovative-health-technology-tested-space.html), [Hexoskin blog](https://www.hexoskin.com/blogs/news/tagged/astronaut-health?page=2) (search summaries; Hexoskin is promotional)
- ANU iLAuNCH Trailblazer (announced July 30, 2024): wearable Space Health Device with Axiom Space (in-space testing), Aqacia (ML), Saber Astronautics (satellite relay). ANU is building medical digital twins using embedded ML plus mathematical physiology models, refined with in-flight data. Phase 2 in-space test has no confirmed date — [iLAuNCH](https://ilaunch.space/media-release/a-wearable-device-to-track-analyse-and-predict-astronaut-health/)
- WVU (Jan 2026): NASA-funded digital twins of movement and muscle activity to detect early deconditioning; uses motion capture, wearables and physics-based simulation — [WVU](https://enews.wvu.edu/articles/2026/01/28/wvu-research-helps-astronauts-stay-healthy-on-long-space-missions) (search summary; page returned 403 when fetched)
- TRISH selected TrialX in 2023 for HERMES, an autonomous, offline-capable health data platform syncing wearable and assessment data in real time or delayed. Telemetric Health AI (TESH, HUNOR project) on Ax-4 used smart shirts, 24h BP monitors, ultrasound, balance tests and fundus imaging; reported early findings are qualitative only, with "AI-assisted alerts" mentioned — [TrialX](https://trialx.com/space-health-research-telemetric-ai-ax4/)
- TRISH partially funded the Empatica prototype that became EmbracePlus — [TrialX/TRISH search summary](https://trialx.com/space-health-research-nasa-spacesuit-audit/) (search summary)
- TRISH innovation "non-contact sleep, vitals and behavior sensing to predict and protect astronaut health" exists — [BCM TRISH](https://bcm.edu/academic-centers/space-medicine/translational-research-institute/research/trish-innovations/non-contact-sleep-vitals-and-behavior-sensing-to-predict-and-protect-astronaut-health) (title only; content not read)
- Inspiration4: crew wore Apple Watch Series 6 (ECG, movement, sleep, heart rate, SpO2, cabin noise). Results published in Nature journals in June 2024 (SOMA package); data in NASA OSDR and SOMA portal. No Oura data found — [Penn Medicine](https://pennmedicine.org/news/news-releases/2024/june/first-study-of-civilian-space-crew-charts-course-for-research-as-commercial-flight-heats-up), [Space Explored](https://spaceexplored.com/web-stories/spacex-inspiration4-will-use-apple-watch-and-ipad-for-health-research-study/) (search summaries)

### Inferences
- The SOMA/OSDR data is a realistic source of open datasets for a hackathon demo (inference; access terms not checked).

### Gaps
- ESA, DLR, JAXA projects, Axiom/SpaceX operational monitoring, Whoop: not researched.

## 4. Prior Space Apps and hackathon/academic projects

### Takeaway
Multiple Space Apps entries (2015-2022) did astronaut health tracking; no winners were confirmed and no 3D-body digital twin entry was found.

### Cited Findings
- AstroMentis (2018): AI platform tracking astronaut physical/mental health from daily logs — [2018 team page](https://2018.spaceappschallenge.org/challenges/can-you-build/bring-your-own-solution/teams/astromentis)
- Fit as a MOoSE (2014, 2015) metabolic observation challenge, including non-invasive basic health monitor projects — [2015 challenge](https://2015.spaceappschallenge.org/challenge/fit-moose-metabolic-observations-space-explorers/)
- 2022 Space Biology Superhero entries: techno mate (bracelet reporting vitals) and blueen (smart bracelet adjusting lighting by vital signs) — [techno mate](https://2022.spaceappschallenge.org/challenges/2022-challenges/space-biology-superhero/teams/techno-mate), [blueen](https://2022.spaceappschallenge.org/challenges/2022-challenges/space-biology-superhero/teams/blueen) (search summaries)

### Gaps
- 2023-2025 galleries not searched; winner status not checked.

## 5. Repeatedly cited gaps and limitations

### Takeaway
Validation evidence is thin; sources are mostly position papers and proofs of concept.

### Cited Findings
- No validated evaluation of an autonomous Mars medical decision-support system was found; sources are conceptual/proof-of-concept — [SpaceCHI 2025](https://drops.dagstuhl.de/storage/01oasics/oasics-vol130-spacechi2025/html/OASIcs.SpaceCHI.2025.33/OASIcs.SpaceCHI.2025.33.html) (search summary)
- Autonomous-crew study: checklists are necessary but not sufficient without real-time flight surgeon support; crews with support performed better — [IAC-21 abstract](https://iafastro.directory/iac/paper/id/63236/abstract-pdf/IAC-21,A1,4,7,x63236.brief.pdf) (search summary)
- Autonomous decisions must judge whether an emergency is delayable within clinical, ethical and legal rules — [SpaceCHI 2025](https://drops.dagstuhl.de/storage/01oasics/oasics-vol130-spacechi2025/html/OASIcs.SpaceCHI.2025.33/OASIcs.SpaceCHI.2025.33.html) (search summary)
- CMO-DA gives no accuracy figures or safety test detail — [Google Cloud blog](https://cloud.google.com/blog/topics/public-sector/how-google-and-nasa-are-testing-ai-for-medical-care-in-space)

### Inferences
- Alarm fatigue, explainability, privacy, crew trust and onboard compute were asked about but I found no source for them. Do not assert them as literature-backed without further search.

### Gaps
- The PMC AI-in-space-medicine review (PMC10466940) could not be read (bot verification page).

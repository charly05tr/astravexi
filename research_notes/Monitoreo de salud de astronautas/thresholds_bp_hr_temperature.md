# Alert thresholds for blood pressure, body temperature and resting heart rate (astronaut self-monitoring app)

Prototype research notes, November 2026. Hackathon material, not medical advice; all thresholds need clinical validation. Many guideline numbers below come from secondary summaries because primary guideline pages returned HTTP 403 (AHA/ahajournals, heart.org) or were paywalled (Nature). Those are flagged.

## Blood pressure: Earth clinical categories (ACC/AHA 2025, ESC 2024), hypotension, orthostatic criteria

### Takeaway
The 2025 ACC/AHA guideline (published Aug 2025, supersedes 2017) keeps the same BP category cutoffs as 2017. ESC 2024 uses a different scheme (non-elevated / elevated / hypertension). Severe BP >=180/120 is the standard "crisis" line; orthostatic hypotension is a sustained drop of >=20 systolic or >=10 diastolic within 3 min of standing.

### Cited Findings
- 2025 ACC/AHA guideline: Jones DW, Ferdinand KC, Taler SJ, et al., J Am Coll Cardiol, online Aug 14, 2025, doi:10.1016/j.jacc.2025.05.007 (also Hypertension 2025;82(10)). The 2017 guideline is therefore superseded. — [2 Minute Medicine summary](https://www.2minutemedicine.com/guidelines/high-blood-pressure/)
- 2025 ACC/AHA categories (same cutoffs as 2017): Normal <120/80; Elevated 120-129 systolic (and diastolic <80); Stage 1 130-139 systolic or 80-89 diastolic; Stage 2 >=140/90. — [2 Minute Medicine](https://www.2minutemedicine.com/guidelines/high-blood-pressure/); [Healio summary](https://www.healio.com/news/nephrology/20250903/top-10-prevention-takeaways-from-the-2025-high-blood-pressure-guideline) (the search snippet says the framework is unchanged; I did not open this page in full)
- 2025 changes are in risk estimation (PREVENT) and treatment initiation, not in category cutoffs; e.g. medication for stage 1 with CVD, diabetes, CKD or PREVENT risk >=7.5%, and add medication if BP still >=130/80 after 3-6 months of lifestyle change. — [2 Minute Medicine](https://www.2minutemedicine.com/guidelines/high-blood-pressure/)
- Severe hypertension / hypertensive crisis: >180 systolic and/or >120 diastolic (listed as "severe hypertension"/"emergency" threshold in a PCNA-hosted table; secondary source, primary guideline text not retrieved). — [PCNA](https://pcna.net/news/putting-updated-blood-pressure-guidelines-into-practice/)
- AHA public guidance (via search summary, heart.org page itself returned 403): at >=180/120 wait about 5 min and retest; if still that high and no organ-damage signs, it is urgency (call doctor); with chest pain, shortness of breath, back pain, numbness/weakness, vision change or speech difficulty it is an emergency, call emergency services without waiting. — [AHA hypertensive crisis page](https://u1-cd-heart.sc.heart.org/en/health-topics/high-blood-pressure/understanding-blood-pressure-readings/hypertensive-crisis-when-you-should-call-911-for-high-blood-pressure) (URL returned by search; not opened directly)
- Hypertensive emergency = severe hypertension with acute end-organ damage; ICU with monitored staged lowering recommended. — [Journal Feed summary](https://journalfeed.org/article-a-day/2025/new-2025-aha-acc-hypertension-guidelines/)
- ESC/ESH-lineage 2024 ESC guideline (office BP): non-elevated <120/70; Elevated 120-139 systolic or 70-89 diastolic; Hypertension >=140/90 (no stage 1-3 classification). Target SBP 120-129 for treated adults, relaxed with orthostatic symptoms, age >85, frailty. — [ACC Ten Points: 2024 ESC](https://www.acc.org/latest-in-cardiology/ten-points-to-remember/2024/09/05/14/11/2024-esc-guidelines-for-bp-esc-2024); [ESC press release](https://escardio.org/The-ESC/Press-Office/Press-releases/New-ESC-Hypertension-Guidelines-recommend-intensified-BP-targets-and-introduce-a-novel-elevated-blood-pressure-category-to-better-identify-people-at-risk-for-heart-attack-and-stroke)
- ESC 2024 prefers out-of-office BP for diagnosis (detects white-coat/masked hypertension). — [PCR review](https://pcronline.com/Cases-resources-images/Tools-and-Practice/The-Essentials/Hypertension/A-review-of-the-2024-ESC-Guidelines-on-elevated-blood-pressure-and-hypertension) (from search summary)
- Orthostatic hypotension: sustained fall >=20 mmHg systolic or >=10 mmHg diastolic within 3 min of standing (2011 consensus definition, reused in a 2024 expert position statement). — [PubMed 38123372](https://pubmed.ncbi.nlm.nih.gov/38123372/); [Merck Manual](https://www.merckmanuals.com/professional/cardiovascular-disorders/symptoms-of-cardiovascular-disorders/orthostatic-hypotension)
- Orthostatic hypertension (separate, rise >=20 systolic with upright >=140) is a different 2022 consensus; do not conflate. — [Hypertens Res 2022](https://www.nature.com/articles/s41440-022-01074-0.pdf)

### Inferences
- Design inference: app tiers could map to Normal/Elevated (info), Stage 1 (advisory), Stage 2 (caution, repeated readings), >=180/120 or symptomatic (warning/escalate). Tier cutoffs are a design choice, not guideline text.
- Design inference: for an in-flight user, the guideline categories are population-derived on Earth; since in-flight BP runs lower (see below), a "normal" reading may mask a relative rise.

### Gaps
- Primary 2025 guideline text (crisis definition, home BP protocol, hypotension numbers) not retrieved: ahajournals.org and heart.org returned 403.
- No numeric hypotension definition (e.g., <90/60) with a citable source was found; the ESC page gave none. Omit or find a source before encoding.

## Blood pressure in spaceflight, NASA guidance and onboard measurement

### Takeaway
24-h BP is lower in orbit (about 8-10 mmHg) with preserved night dip, driven by vasodilatation, while the main operational risk is post-flight/gravity re-exposure orthostatic intolerance. I found no NASA numeric BP alert thresholds and no documented routine onboard BP schedule.

### Cited Findings
- Norsk et al. 2015, J Physiol 593:573-584: 8 male astronauts (aged 45-53) wore ambulatory BP monitors before flight, during 85-192 days on the ISS, and >=2 months after return. 24-h average systolic, diastolic and mean arterial BP fell by 8 +/- 2, 9 +/- 2 and 10 +/- 3 mmHg; systemic vascular resistance fell 39%; stroke volume +35%, cardiac output +41%; nocturnal dip maintained; heart rate and catecholamines unchanged; cause of vasodilatation unidentified. — [Physiological Society summary](https://www.physoc.org/?p=70744); [ScienceDaily](https://www.sciencedaily.com/releases/2015/01/150114101638.htm); [PMC editorial PMC4324697](https://pmc.ncbi.nlm.nih.gov/articles/PMC4324697) (confirms 10 mmHg mean fall and +41% CO)
- NASA risk page: orthostatic intolerance during acceleration is the primary in-mission cardiovascular risk (LEO, lunar surface); cardiovascular disease is the main long-term risk beyond LEO. Also, stagnant or reverse internal jugular flow in 6 of 11 crew (55%) around flight day 50, one occlusive thrombus. — [NASA HHP cardiovascular risk](https://www.nasa.gov/directorates/esdmd/hhp/risk-of-cardiovascular-adaptations-contributing-to-adverse-mission-performance-and-health-outcomes/)
- NASA evidence report "Risk of Orthostatic Intolerance During Re-exposure to Gravity" treats post-flight orthostatic intolerance as established; an in-flight leg-cuff test did not predict who would have post-flight orthostatic hypotension; longer exposure aggravates it. — [NTRS report](https://ntrs.nasa.gov/api/citations/20150007319/downloads/20150007319.pdf) (PDF text not extractable; claims via search summary); [npj Microgravity study](https://www.nature.com/articles/s41526-019-0082-3.pdf) (paywalled/redirect; via search summary)
- Astroskin (Bio-Monitor) has been worn by Canadian, American, Italian and Japanese astronauts; manufacturer says it logs BP, pulse oximetry, 3-lead ECG, respiration, skin temperature and activity for 48 h. Vendor source, treat cautiously. — [Hexoskin](https://www.hexoskin.com/blogs/news/tagged/astronaut-health?page=1); [UNOOSA Astroskin doc](https://www.unoosa.org/documents/pdf/Space4PersonswithDisabilites/2023Spinoffs/Astroskin.pdf)
- Canadian BP Reg study used a fingertip BP monitor and a self-applied leg-cuff test in microgravity; the fingertip monitor was less accurate than the breathing test for detecting change. — [CSA BP Reg](https://asc-csa.gc.ca/eng/iss/bpreg.asp)

### Inferences
- Design inference: if in-flight 24-h BP is ~8-10 mmHg below ground baseline, a personal in-flight baseline (not Earth categories) should anchor deviation rules; flag a rise >=10 mmHg sustained over several days vs own in-flight median (unsourced threshold).
- Design inference: pre-landing/pre-EVA-return windows should raise the weight of orthostatic checks (supine/seated vs standing drop >=20/10).

### Gaps
- No NASA-STD-3001 or OCHMO text on BP alert limits was retrieved. The search returned NASA-STD-3001 Vol 1 PDFs (e.g., https://standards.nasa.gov/sites/default/files/standards/NASA/B/Historical/NASA-STD-3001-VOL-1A-Chg1-1.pdf) but I did not open them.
- Onboard BP measurement frequency/device (cuff model) not found; Astroskin details come from vendor sources.
- Norsk full text (absolute mmHg values pre/in-flight, post-flight changes) not read; only abstract-level numbers.

## Body temperature: Earth thresholds, spaceflight findings, NASA thermal, measurement

### Takeaway
On Earth fever is commonly >=38 C (core) with site-dependent normals; hypothermia <35 C; >40 C is severe hyperthermia. In 11 ISS astronauts, resting core temperature (forehead double-sensor estimate) rose about 1.0 C and exercise peak about 1.4 C, sometimes >40 C, so fixed Earth thresholds are poorly calibrated for flight.

### Cited Findings
- Stahn et al. 2017, Sci Rep 7:16180, doi:10.1038/s41598-017-15560-w: 11 astronauts (7 M, 4 F, mean age 50 +/- 4), ~6-month ISS stays; resting core body temperature (CBT) +1.01 C vs baseline, plateau after ~75 days, slow return in recovery; exercise peak CBT +1.39 C, exceeding 40 C in some individuals; exercise CBT rise rate 0.10 to 0.15 C/min (main effect not significant, p=0.18). — [Stahn 2017, PMC5701078](https://pmc.ncbi.nlm.nih.gov/articles/PMC5701078)
- Method: non-invasive "Double Sensor" forehead heat-flux device (skin temperature probe + heat flux sensor), 0.5 Hz, 1-min averages; protocol three 5-min stages at 25/50/75% pre-flight VO2max then +25 W/min to exhaustion; ISS ambient 23.6 +/- 1.8 C vs ground 21.0 +/- 1.2 C. Absolute preflight CBT values were not reported. — [PMC5701078](https://pmc.ncbi.nlm.nih.gov/articles/PMC5701078)
- IL-1ra followed CBT time course (r=0.32 rest, r=0.41 exercise); authors propose "space fever", mechanism unresolved. — [PMC5701078](https://pmc.ncbi.nlm.nih.gov/articles/PMC5701078)
- Thresholds quoted in the same paper: normal CBT about 37 C; occupational guidance CBT not above 38.0 C in prolonged heavy work; deviations below 33 C or above 40 C can be life-threatening; stress-induced hyperthermia up to ~2 C. — [PMC5701078](https://pmc.ncbi.nlm.nih.gov/articles/PMC5701078)
- Earth definitions (secondary, not CDC/Mayo primary): fever >38 C; severe hyperthermia/heatstroke >40 C; hypothermia <35 C; oral normal ~36.1-37.5 C (another source ~36.8 C); oral fever thresholds quoted as 37.5 or 37.8 C; rectal runs higher than oral; normal daily variation ~0.5 C; no single agreed upper limit (37.5-38.3 C range of definitions). — [Ausmed](https://ausmed.com.au/cpd/articles/temperature-checking); [Lecturio](https://www.lecturio.com/concepts/fever/)
- NASA suit thermal: heat-storage requirement uses the Wissler/41-node model; an unverified, garbled snippet suggests impairment from a ~0.6 C core rise or pulse >140 bpm. Not confirmed as NASA-STD-3001 text. — [NASA spacesuit reference](https://www.nasa.gov/reference/11-0-spacesuits-vol-2/)

### Inferences
- Design inference: use a personal in-flight baseline for resting temperature; alert on deviation (e.g., >= +0.5 C above 7-day own median at rest = advisory, sustained >= +1.0 C beyond the known space-fever offset or with symptoms = caution) plus absolute floors (>=38.0 C core-equivalent = caution, >=39-40 C or <35 C = warning). Numbers are unsourced design choices except 38/40/35 above.
- Design inference: exercise sessions should have a thermal-cutoff (e.g., stop/cool when estimated CBT approaches 40 C) given Stahn's >40 C observations; forehead estimates are not equivalent to oral/tympanic readings, so keep site-specific baselines.

### Gaps
- Primary CDC/Mayo/AHA fever and hypothermia pages not retrieved; Earth figures are secondary.
- NASA-STD-3001 thermal limits and ISS onboard thermometer (Thermolab/Double Sensor operational use) not verified.
- Stahn mission-day absolute values and any alert guidance for fever in space: none found.

## Resting heart rate (brief)

### Takeaway
Adult resting 60-100 bpm; <60 bradycardia, >100 tachycardia (NHLBI/AHA-based). In ISS data resting HR appears largely unchanged (Norsk: unchanged), with HRV changes better documented.

### Cited Findings
- Bradycardia: resting HR <60 bpm; tachycardia: resting HR >100 bpm; fit/young people may normally run slower. — [NHLBI](https://www.nhlbi.nih.gov/health/arrhythmias/types)
- AHA normal resting 60-100 bpm and bradycardia symptoms (fatigue, dizziness, confusion, fainting, shortness of breath, chest pain), via search summary of secondary pages. — [Yale Medicine](https://www.yalemedicine.org/news/what-is-a-normal-resting-heart-rate)
- Ventricular arrhythmias usually need care right away; sustained VT can progress to VF. — [NHLBI](https://www.nhlbi.nih.gov/health/arrhythmias/types)
- In orbit, heart rate unchanged in Norsk et al. 2015 (see BP section). — [Physiological Society](https://www.physoc.org/?p=70744)
- HRV scaling changes within about 1 month of flight (Otsuka et al., npj Microgravity). — [Springer Nature Communities](https://communities.springernature.com/posts/npj-microgravity-article-intrinsic-cardiovascular-autonomic-regulatory-system-of-astronauts-exposed-long-term-to-microgravity-in-space-observational-study)

### Inferences
- Design inference: escalate immediately (warning, contact CMO/flight surgeon) on chest pain, syncope or near-syncope, new irregular rhythm with symptoms, or resting HR >100 or <50 with symptoms. The 50 bpm figure is an unsourced design choice; use own baseline (e.g., +/-15-20% from 7-day median).

### Gaps
- AHA primary pages not fetched; red-flag list is from secondary sources and common clinical practice.
- Hughson 2012 (ISS, 6 astronauts, no significant HR change) appeared only in a search summary without a verified URL; not relied on.
- Gundel 2002 "basal heart rate in spaceflights up to 438 days" found as title only.

## Preventive routine actions (all three indicators)

### Takeaway
I did not retrieve sourced evidence for specific countermeasure numbers, so these are listed as gaps/design inference.

### Cited Findings
- 2025 ACC/AHA: lifestyle first for lower-risk stage 1, drug therapy added if >=130/80 persists at 3-6 months; ESC 2024: lifestyle for 3 months before drugs. — [2 Minute Medicine](https://www.2minutemedicine.com/guidelines/high-blood-pressure/); [ACC Ten Points](https://www.acc.org/latest-in-cardiology/ten-points-to-remember/2024/09/05/14/11/2024-esc-guidelines-for-bp-esc-2024)
- A 2023 npj Microgravity study (46 astronauts, ~178 days, ~600 min/week exercise) found exercise did not fully prevent multisystem deconditioning (via search summary, source URL not opened). — search result list for npj Microgravity (unverified)

### Inferences
- Design inference: suggested routine changes (hydration/salt adjustment, scheduled exercise, sleep regularity, cooling after exercise, compression garment/LBNP before landing, CO2 checks when headache or temperature/HR drift) are plausible but not evidenced here.

### Gaps
- No retrieved source for fluid/salt loading, compression garments, LBNP, thermal management of exercise, or CO2 effects on BP/HR/temperature. Recommend targeted search of NASA evidence reports and npj Microgravity before encoding.

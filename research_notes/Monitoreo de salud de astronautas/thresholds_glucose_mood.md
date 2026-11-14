# Alert thresholds for blood glucose and mood (astronaut self-monitoring app)

Scope note: hackathon prototype. All thresholds need clinical validation; this is not medical advice. Prepared 2026-11-14. Rows marked "design inference" are not from a source. Research depth was limited (about 20 tool calls); several items are Gaps and are listed explicitly.

## Blood glucose: current ADA thresholds (2026 edition)

### Takeaway
The current edition is ADA Standards of Care 2026 (Diabetes Care 2026;49 Suppl 1, online Dec 8, 2025). It supersedes 2025. Numbers: fasting normal <100, prediabetes 100-125, diabetes >=126 mg/dL; hypoglycemia level 1 <70, level 2 <54, level 3 = severe event needing assistance regardless of value.

### Cited Findings
- Diabetes diagnosis (nonpregnant): FPG >=126 mg/dL; 2-h PG during 75-g OGTT >=200 mg/dL; A1C >=6.5%; random PG >=200 mg/dL only with classic hyperglycemic symptoms or crisis — [ADA 2026 Section 2, Table 2.1 (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC12690183)
- Prediabetes: FPG 100-125 mg/dL (IFG); 2-h PG 140-199 mg/dL (IGT); A1C 5.7-6.4% — [ADA 2026 Section 2, Table 2.2 (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC12690183)
- Fasting = no caloric intake for at least 8 h. Without unequivocal hyperglycemia, diagnosis needs two abnormal results — [ADA 2026 Section 2](https://pmc.ncbi.nlm.nih.gov/articles/PMC12690183)
- Fasting "normal" is implied as <100 mg/dL (below the IFG range); the table does not print a "normal" row in the extract I read — [ADA 2026 Section 2](https://pmc.ncbi.nlm.nih.gov/articles/PMC12690183)
- Glycemic targets for people with diabetes (Table 6.3): preprandial capillary glucose 80-130 mg/dL; peak postprandial <180 mg/dL measured 1-2 h after meal start — [ADA 2026 Section 6 (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC12690178)
- Hypoglycemia (Table 6.4): level 1 <70 and >=54 mg/dL; level 2 <54 mg/dL; level 3 = severe event with altered mental or physical status requiring assistance, regardless of glucose; treatment alert value <=70 mg/dL — [ADA 2026 Section 6](https://pmc.ncbi.nlm.nih.gov/articles/PMC12690178)
- CGM targets (Table 6.2, adults with T1D/T2D): time in range 70-180 >70%; time below 70 <4%; time below 54 <1%; time above 180 <25%; time above 250 <5%; CV <=36%; valid data needs >=70% wear over 14 days — [ADA 2026 Section 6](https://pmc.ncbi.nlm.nih.gov/articles/PMC12690178)
- Ketone testing is advised for people at risk of DKA when glucose is >200 mg/dL (11.1 mmol/L), especially with symptoms — [ADA 2026 Section 6](https://pmc.ncbi.nlm.nih.gov/articles/PMC12690178)
- 2026 Standards expand CGM recommendation to diabetes onset for people on insulin (Rec 7.15) — [Dexcom provider summary of ADA 2026 (secondary, industry)](https://provider.dexcom.com/clinical-education-material/key-cgm-recommendation-ada-2026-soc)

### Inferences
- Tier mapping (design inference): info = fasting 100-125 or post-meal 140-199 (prediabetes-range, trend only); advisory = repeated fasting >=100 across days or personal deviation (below); caution = single value <70 or >=200 asymptomatic (confirm by repeat measurement); warning = <54, any altered mental status (level 3), or >250 with symptoms/ketone concern.
- The ADA diagnostic cutoffs are for diagnosis in clinical settings with lab confirmation; using them as in-flight alert levels is a design choice that needs flight-surgeon validation.
- CGM time-in-range targets are validated for people with diabetes. Applying them to healthy crew is an extrapolation (see Gaps).

### Gaps
- The ">250-300 mg/dL with symptoms" red flag: I did not find an explicit ADA 2026 figure for it; only the >200 mg/dL ketone-testing trigger was confirmed. The Section 6 text was only 100,000 of 226,689 characters read (hyperglycemic crisis part not read).
- CGM metrics for non-diabetic people: no ADA source found for normal-range TIR; not verified.
- ADA Section 2 page was read via a summarizer; Table 2.2 values match the well-known criteria but verify against the full text before shipping.

## Glucose metabolism in spaceflight and bed rest; onboard measurement

### Takeaway
Bed rest and spaceflight are associated with insulin resistance and a shift toward carbohydrate use; data from short commercial flights show no significant metabolic-panel change. Suite Ride (Ax-4) reports CGM worked in orbit, but only via press, preliminary, without numbers.

### Cited Findings
- Inspiration4 (3-day flight): physiological/stress responses were broad but almost all returned to baseline after landing; clinical measurements included a comprehensive metabolic panel — [Nature/PMC summary via search](https://pmc.ncbi.nlm.nih.gov/articles/PMC11357997); the companion single-cell paper reports no other significant basic metabolic panel changes apart from immune changes (as summarized by search result; not directly verified in full text) — [PMC11094041](https://pmc.ncbi.nlm.nih.gov/articles/PMC11094041)
- Glucose-specific numbers from Inspiration4 were not found; the clinical data are in NASA OSDR (search result suggested OSD-569 to OSD-575) — [Nature/PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC11357997)
- ENERGY study (npj Microgravity 2024, 11 male ISS astronauts): spaceflight increased fasting respiratory quotient and carbohydrate oxidation and decreased fasting lipid oxidation; authors suggest dietary change may mainly explain it; their earlier 21-day bed-rest work found the carbohydrate shift preceded glucose intolerance (secondary summary of the paper) — [DOAJ record](https://doaj.org/article/63ce14cd48a54d02b339e2b36b83b573)
- 60-day head-down bed rest: significant time effects for decreases in the Matsuda index and liver insulin sensitivity — [Frontiers in Physiology 2024](https://www.frontiersin.org/journals/physiology/articles/10.3389/fphys.2024.1435448/pdf)
- Review: physical inactivity drives insulin resistance and metabolic inflexibility in bed-rest studies — [J Appl Physiol 2011](https://pubmed.ncbi.nlm.nih.gov/21836047/)
- Suite Ride (Ax-4, 18-day ISS mission, Burjeel + Axiom, results announced Sept 26, 2025): astronauts wore CGMs throughout; CGM compared with fingerstick and lab analysis; clinical lead Dr Mohammad Fityan said CGMs transmitted accurate real-time data under microgravity, radiation and circadian disruption; no sample size, device model or accuracy numbers published; insulin pen results preliminary, returned insulin still under testing; more testing of circadian, pressure and fluid-shift effects on CGM planned — [The National](https://www.thenationalnews.com/future/space/2025/09/27/uae-led-research-shows-insulin-pens-and-monitors-can-work-in-space)
- Galactic 07 suborbital flight reportedly showed insulin pens work in microgravity — [The National](https://www.thenationalnews.com/future/space/2025/09/27/uae-led-research-shows-insulin-pens-and-monitors-can-work-in-space)
- NASA does not consider type 1 diabetes eligible for spaceflight (as reported in the same article) — [The National](https://www.thenationalnews.com/future/space/2025/09/27/uae-led-research-shows-insulin-pens-and-monitors-can-work-in-space)
- NASA-STD-3001 Vol 1 current version is Rev C (approved 2023-09-15), superseding Rev B — [NASA search result listing](https://standards.nasa.gov/sites/default/files/standards/NASA/C//nasa-std-3001-vol-1-rev-c-signature.pdf). Vol 2 [V2 7003] default energy provision about 3,035 kcal/crew/day — [NASA-STD-3001 Vol 2 via search](https://www.nasa.gov/reference/7-0-habit-ability-functions-vol-2/)

### Inferences
- Design inference: prediabetes-range readings are plausible in flight from reduced insulin sensitivity; use trend and repeat measurement before escalating.
- Design inference: Suite Ride supports CGM feasibility but no peer-reviewed accuracy data exist yet in my sources; treat CGM values as +/- uncertain and confirm threshold crossings with a fingerstick.

### Gaps
- No peer-reviewed Suite Ride publication found. No Inspiration4 glucose numbers. Exact text of NASA-STD-3001 V1 4020 not retrieved. No evidence-graded source found for meal timing/exercise/sleep effects on glucose in crew (general nutrition: carbohydrate 45-65% of calories in a NASA 2020 exploration nutrition requirements document — [NTRS JSC-67378](https://ntrs.nasa.gov/api/citations/20205008306/downloads/JSC67378%20Expl%20Nutr%20Reqs%20042020.pdf), snippet only). Limitations of onboard glucometers/blood analyzers not researched.

## Glucose personal-baseline deviation rule

### Takeaway
No sourced rule exists; propose one clearly labelled as design inference.

### Inferences (all design inference, not sourced)
- Build a 14-day rolling baseline of fasting readings (median and MAD). Advisory if fasting value exceeds baseline by >=15 mg/dL on 3 of 5 consecutive days; caution if fasting >=100 mg/dL on >=3 consecutive days with a rising trend, or any value <70 or >=200 (repeat in 15 min); warning if <54, >250 with symptoms, or any confusion/loss of consciousness (level 3 style) — route directly to Crew Medical Officer and ground.
- Always re-test a threshold crossing before escalating; log meals, exercise, sleep alongside.

### Gaps
- All numeric deviation margins above need pilot data and clinical review.

## Mood instruments and scoring cutoffs

### Takeaway
PHQ-9 bands 5/10/15/20, GAD-7 bands 5/10/15, and PHQ-2/GAD-2 screen cutoff >=3 are well established; item 9 handling is a clinical convention that I could not pin to a primary source.

### Cited Findings
- PHQ-9: 0-4 none/minimal, 5-9 mild, 10-14 moderate, 15-19 moderately severe, 20-27 severe — [Deployment Psych PHQ toolkit](https://deploymentpsych.org/sites/default/files/member_resource/COP_Toolkit/Metrics_Series-Patient_Health_Questionnaire_PHQ.pdf)
- GAD-7 5/10/15 for mild/moderate/severe; PHQ-2 and GAD-2 optimal cutpoint >=3; parent scales >=10 — [Systematic review, PubMed 20633738](https://pubmed.ncbi.nlm.nih.gov/20633738/); [UW GAD-7 instructions](https://depts.washington.edu/psychres/wordpress/wp-content/uploads/2017/09/gad7_inst.pdf)
- Item 9 covers thoughts of self-harm or being better off dead; reviewed separately from the total — [Joint Commission PHQ instructions](https://manual.jointcommission.org/pub/BHCInstruments/RomInstr00054/instructions_PHQ.pdf) (snippet-level; verify)
- NASA Spaceflight Standard Measures: behavioral health component includes neurocognitive battery, actigraphy, proximity sensors, and subjective self-reports of mood, depression and team/social processes — [NASA LSDA Standard Measures](https://nlsp.nasa.gov/explore/home/lsda_sm_iss)
- POMS: Total Mood Disturbance = sum of tension, depression, anger, fatigue, confusion minus vigor; used weekly in Mars-500 with BDI-II — [Basner et al. PLoS ONE 2014 summary](https://doi.org/10.1371/journal.pone.0093298)

### Inferences
- Design inference: tiers: PHQ-2 >=3 or PHQ-9 5-9 info/advisory; 10-14 caution; >=15 or any item 9 >0 warning with same-day CMO contact. Item 9 >0 as immediate escalation is a common clinical convention (design inference here; source not confirmed).
- Design inference: use a 2-item daily check-in plus weekly PHQ-9/GAD-7 to limit burden.

### Gaps
- Not found/verified: POMS short-form cutoffs, PANAS scoring, visual analog scale cutoffs, ARCHeR instrument details (NASA page returned no content), NASA Cognition battery details, official phqscreeners.com scoring page. POMS and PANAS have no universal clinical cutoffs in my sources.

## Mood trajectories in isolation analogs and communication delay

### Takeaway
Individual variability dominates; the third-quarter phenomenon is contested; communication delay increases isolation and autonomy and reduces well-being in some studies.

### Cited Findings
- Mars-500 (6 men, 520 days): one crewmember had the highest POMS TMD and depression symptoms in 93% of weeks (mild-to-moderate in >10%); two crew showed no distress; large inter-individual differences — [Basner et al. 2014, PLoS ONE](https://doi.org/10.1371/journal.pone.0093298)
- Mars-500 stage-changing pattern similar to third-quarter phenomenon — [Wang et al. PLoS ONE 2014](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3973648/)
- Antarctic meta-analysis: negative mood did not peak at the third quarter; other studies found peaks in the second half or fourth quarter; McMurdo POMS depression did not show the midwinter rise while tension-anxiety and fatigue rose in the last two months — [Polar Record meta-analysis](https://doi.org/10.1017/S003224741700050X); [Palinkas summary](https://www.rrh.org.au/journal/article/1351)
- Mars-500 (Kanas 2011): high autonomy rated well, mood and self-direction higher, but confounded with delay; HERA: 180-s delay left 1 of 5 messages routed vs 4 of 5 without delay; ISS (Kintz 2016): self-reported well-being and communication quality reduced in delay tasks, with stress and frustration — [NASA HRP IWS 2025 Comm Delay review](https://ntrs.nasa.gov/api/citations/20250000703/downloads/2025%20HRP%20IWS%20Comm%20Delay.pdf)
- Interviews: delay increases isolation but also autonomy, crew rely on each other; family connectedness is very important; Mars-like delay = email, crew missed voices, recordings treasured — [same NASA review](https://ntrs.nasa.gov/api/citations/20250000703/downloads/2025%20HRP%20IWS%20Comm%20Delay.pdf)
- Mars one-way delay about 19 min per NASA presentation (task text says 4-24 min) — [NASA Behavioral Health Challenges of Mars Missions, 2024](https://ntrs.nasa.gov/api/citations/20240010442/downloads/Behavioral%20Challenges%20of%20a%20Mars%20Mission.pdf)
- NASA example countermeasures: communication protocols with ground and family given delay, plants, exercise, lighting, sleep stations, adaptive training; multi-modal (subjective plus objective) monitoring — [same NASA 2024 presentation](https://ntrs.nasa.gov/api/citations/20240010442/downloads/Behavioral%20Challenges%20of%20a%20Mars%20Mission.pdf)
- HRP 2026 work lists a semi-autonomous behavioral health monitoring system deliverable tied to delay — [NTRS HRP IWS 2026 overview](https://ntrs.nasa.gov/api/citations/20260002656/downloads/HRP%20IWS%202026%20HFBP%20Overview%20export%20control%2042026.pdf) (from search snippet; URL as returned by search, verify)

### Inferences
- Design inference: because trajectories differ per person, use personal baselines, not a mission-phase calendar rule (do not hard-code a third-quarter alert).
- Design inference: delay makes real-time escalation to ground impractical, so the CMO tier must carry first response.

### Gaps
- HERA and CHAPEA mood trajectory numbers not found. Evidence quality for exercise, light, VR nature exposure, debriefs not retrieved. Privacy/ethics guidance (who sees mood data) not sourced; no NASA policy found.

## Mood escalation, preventive actions, privacy, and baseline rule

### Takeaway
Persistence criteria and privacy tiers are not sourced from the materials I retrieved; propose as design inference.

### Inferences (all design inference)
- Persistence: PHQ-2 >=3 on 3 of 7 days (advisory) or PHQ-9 >=10 on two consecutive weekly checks or 14-day persistence aligned with the DSM/PHQ two-week framing (caution); PHQ-9 >=15, or item 9 >0 at any time (warning). The two-week framing is a general convention; I did not retrieve the DSM text.
- Personal baseline: 28-day baseline of daily mood score; advisory if 7-day mean is >=1 SD (or >=20% of scale) below baseline; caution if that holds 14 days or with concurrent sleep drop and withdrawal; combine with sleep, activity, workload.
- Preventive actions to offer (supported by NASA presentation as example countermeasures, not graded): exercise, lighting/sleep schedule, family communication, plants/nature, workload adjustment.
- Privacy: crew member sees all own data by default; share with CMO on caution or warning or consent; ground flight surgeon sees summaries by default with item 9 overrides. Needs ethics/medical-privacy review.

### Gaps
- Preventive-action evidence strength, DSM criteria, and privacy standards were not researched; verify before use.

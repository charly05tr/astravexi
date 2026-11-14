# Astronaut Preventive-Health Engine: Thresholds, Countermeasures, Anomaly Detection and Alert Design

Note: all numbers below are for research/design input only. Clinical validation by flight surgeons / clinicians is required before any real-world use. Research method: web search snippets plus full text extraction of NASA-STD-3001 Vol. 1 Rev C (downloaded PDF, pdftotext). Several items come from search-engine summaries of primary sources; these are flagged "(secondary; verify in primary)". Date of research: Nov 2026.

## NASA-STD-3001 Vol. 1 (Rev C) crew health standards with numbers

### Takeaway
Rev C (approved 2023-09-15, supersedes Rev B) is the current standard and contains hard numbers: in-mission VO2max floors (32.9 / 36.5 ml/min/kg), 80% of pre-mission aerobic capacity and strength, BMD >=95% (hip/spine) and >=90% (femoral neck), 100% of calculated energy/nutrient needs, 600 mSv career effective dose (confirmed universal for all ages and sexes), 250 mSv SPE effective dose design limit, and a recommended 8.5 h sleep period. Behavioral health has no numeric limit, only "within clinically accepted values".

### Cited Findings
- Rev C is the active, most current version, approved 2023-09-15, supersedes Rev B — [OCHMO TB-031 / search summary](https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-031-exercise-overview.pdf); full text: [NASA-STD-3001 Vol 1 Rev C](https://standards.nasa.gov/sites/default/files/standards/NASA/C//nasa-std-3001-vol-1-rev-c-signature.pdf)
- [V1 4001] In-mission VO2max >= 32.9 ml/min/kg for missions with microgravity EVAs (direct or indirect measure). Table 4.1-1 recommends pre-mission VO2max of 38.7 (if 15% in-mission decline) or 43.8 ml/min/kg (if 25% decline) for ISS. Derived from assumed EVA demand of 30% of VO2max, mean EVA 6.67 h, max 8 h — [Rev C PDF](https://standards.nasa.gov/sites/default/files/standards/NASA/C//nasa-std-3001-vol-1-rev-c-signature.pdf)
- [V1 4002] In-mission VO2max >= 36.5 ml/min/kg for missions with extraterrestrial surface EVAs (rationale says little data; based on Apollo/ISS/analogs) — [Rev C PDF](https://standards.nasa.gov/sites/default/files/standards/NASA/C//nasa-std-3001-vol-1-rev-c-signature.pdf)
- [V1 4003] In-mission aerobic capacity >= 80% of pre-mission capacity; [V1 4004] post-mission reconditioning returns to pre-mission VO2max. Aerobic capacity falls approx. 10-30% after spaceflight (HRP-047072); bedrest 6-16% after 10 days (Convertino 1997 cited in the standard) — [Rev C PDF](https://standards.nasa.gov/sites/default/files/standards/NASA/C//nasa-std-3001-vol-1-rev-c-signature.pdf)
- [V1 4023] Pre-mission strength minimums (Table 4.6-1): deadlift 1.0 x body weight (BW) minimum, 1.3 x BW microgravity EVA, 1.6 x BW surface EVA, 1.3 x BW unaided terrestrial egress; bench press 0.7 / 0.8 / 1.0 / 0.7 x BW (table layout from PDF text extraction was jumbled; column assignment inferred, verify against the PDF) — [Rev C PDF](https://standards.nasa.gov/sites/default/files/standards/NASA/C//nasa-std-3001-vol-1-rev-c-signature.pdf)
- [V1 4024] In-mission skeletal muscle strength >= 80% of baseline; lower-body muscle CSA/strength decreases approx. 10-30% after flight; strength is evaluated within 5-7 days of landing with a daily reconditioning schedule — [Rev C PDF](https://standards.nasa.gov/sites/default/files/standards/NASA/C//nasa-std-3001-vol-1-rev-c-signature.pdf)
- [V1 4026] Pre-mission hip and L1-L4 DXA T-scores consistent with age/sex/ethnicity-matched population. [V1 4027] Countermeasures shall maintain hip and spine BMD >= 95% of pre-mission and femoral neck >= 90%. Rationale: with ARED, cycle ergometer, treadmill most crew return with <10% femoral neck and <5% total hip/spine deficit over 6-month ISS missions; bisphosphonate + exercise gave ~0% loss. Triennial BMD imaging is listed in the medical-care requirements — [Rev C PDF](https://standards.nasa.gov/sites/default/files/standards/NASA/C//nasa-std-3001-vol-1-rev-c-signature.pdf)
- [V1 4020] Provide each crewmember 100% of calculated nutrient and energy requirements (age, sex, body mass, height, activity factor). Rev C no longer states a numeric body-mass-loss limit (requirement [V1 4021] is "deleted") — [Rev C PDF](https://standards.nasa.gov/sites/default/files/standards/NASA/C//nasa-std-3001-vol-1-rev-c-signature.pdf). Whether the deleted 4021 was a body-mass limit is not shown in the text I read (gap).
- [V1 4030] Career effective dose from spaceflight radiation < 600 mSv, universal for all ages and sexes (replaces age/sex-dependent limits); based on keeping excess cancer mortality (REID) < 3% mean; uses NASA Q / 35-year-old female model; ALARA [V1 4029] — [Rev C PDF](https://standards.nasa.gov/sites/default/files/standards/NASA/C//nasa-std-3001-vol-1-rev-c-signature.pdf); rationale cites [NASEM 2021](https://doi.org/10.17226/26155)
- [V1 4031] Design reference SPE (Oct 1989 spectrum) effective dose < 250 mSv — [Rev C PDF](https://standards.nasa.gov/sites/default/files/standards/NASA/C//nasa-std-3001-vol-1-rev-c-signature.pdf)
- Table 4.8-1 non-cancer organ limits (30-day / 1-year / career): lens 1,000 / 2,000 / 4,000 mGy-Eq; skin 1,500 / 3,000 / 6,000 mGy-Eq; blood-forming organs 250 / 500 mGy-Eq (no career); circulatory 250 / 500 / 1,000 mGy-Eq; CNS (hippocampus) 500 / 1,000 / 1,500 mGy (a row of 100 / 250 mGy for CNS Z>=10 appears as a separate row; the extraction was jumbled, verify) — [Rev C PDF](https://standards.nasa.gov/sites/default/files/standards/NASA/C//nasa-std-3001-vol-1-rev-c-signature.pdf)
- Radiation reference rates in the standard: unshielded GCR approx. 1.5 mSv/day in free space; deep-space transit approx. 0.5 mSv/day cited for Mars habitat-source context; shielding requirement of approx. 1.3 mSv/day free space and <0.9 mSv/day planetary surface; Figure 4.8-1 shows dose rate varies with solar cycle — [Rev C PDF](https://standards.nasa.gov/sites/default/files/standards/NASA/C//nasa-std-3001-vol-1-rev-c-signature.pdf)
- Sleep/schedule guidance (rationale, not a limit): recommended 8.5 h sleep period plus 2 h pre-sleep and 1.5 h post-sleep; avoid critical tasks in nominal sleep period and circadian nadir (typically 1-7 AM relative to habitual schedule); integrate light, naps, pharmacological/non-pharmacological countermeasures; [V1 4014] requires established limits for workday, exercise and planned sleep — [Rev C PDF](https://standards.nasa.gov/sites/default/files/standards/NASA/C//nasa-std-3001-vol-1-rev-c-signature.pdf)
- Behavioral/cognitive: [V1 4011] pre/in/post-mission behavioral health and cognitive status within "clinically accepted values" as determined by behavioral health evaluations; [V1 4012-4013] end-of-mission assessment; [V1 6004] programs shall implement psychological/behavioral support — no numeric thresholds — [Rev C PDF](https://standards.nasa.gov/sites/default/files/standards/NASA/C//nasa-std-3001-vol-1-rev-c-signature.pdf)
- Hematology/immunology: [V1 4015-4018] values within healthy-population normal ranges, countermeasures keep values outside "critical values"; no numeric values given in the standard — [Rev C PDF](https://standards.nasa.gov/sites/default/files/standards/NASA/C//nasa-std-3001-vol-1-rev-c-signature.pdf)

### Inferences
- The engine can encode "80% of personal baseline" rules for aerobic capacity and strength, "95%/90% of baseline" for BMD, an absolute VO2max floor (32.9 or 36.5), and radiation dose-budget tracking vs 600 mSv career / 250 mSv SPE / organ limits.
- Rev C's pre-mission VO2max recommendation (38.7-43.8) is a good "entry fitness" reference. Sleep (8.5 h opportunity) is a scheduling guideline, not a measured-sleep threshold, so any "sleep debt" threshold must be set by the product team and validated.

### Gaps
- Exact body-mass-loss limit: not found in Rev C (4021 deleted). OCHMO nutrition TB not fetched.
- Not read: OCHMO technical briefs for radiation, bone, nutrition, sleep, noise (only TB-031 identified).
- Table layouts for muscle strength and CNS limits were scrambled in text extraction; verify in the PDF.

## Bone loss and renal stones

### Takeaway
ISS bone loss without effective countermeasures is on the order of 1%/month at weight-bearing sites (more by CT at some sites); ARED plus bisphosphonate gives approx. 0% loss in studies. Renal stone risk is driven by low urine volume, low citrate and hypercalciuria; potassium citrate (approx. 20 mEq/day) was tested on ISS.

### Cited Findings
- Bone loss estimates cluster around 1%/month at weight-bearing sites; cosmonaut data 1-1.5%/month hip, 1%/month spine; ISS-crew CT study 2.2-2.7%/month interior hip bone and 0.8-0.9%/month vertebrae; up to 10-15x terrestrial age-related rates (secondary; verify) — [NASA ISSRDC slide](https://nasa.gov/wp-content/uploads/2013/10/issrdc_2013-07-16-0945_lang20132.pdf); [Springer, Arch Osteoporos 2025](https://link.springer.com/article/10.1007/s11657-025-01624-2)
- Four ISS crew: BMD decreased 0.71%/month (femoral neck) and 0.83%/month (lumbar spine); authors concluded measured exercise duration/loading were insufficient (small N, older ISS data; secondary) — [Search-surfaced study summary](https://doi.org/10.1016%2Fj.bone.2019.07.013)
- Alendronate plus ARED can prevent/attenuate group mean aBMD decline over about 6-month flights; unclear which component contributed (secondary) — [Springer reference entry](https://rd.springer.com/referenceworkentry/10.1007/978-3-319-10152-1_95-2); NASA standard rationale confirms ~0% loss with bisphosphonate + exercise — [Rev C PDF](https://standards.nasa.gov/sites/default/files/standards/NASA/C//nasa-std-3001-vol-1-rev-c-signature.pdf)
- Renal stone risk: in-flight decreased urine volume and citrate, increased urinary calcium; crew also reduced fluid, potassium, magnesium, citrate intake; higher fluid intake lowers urinary risk factors — [NASA NTRS 20090019087](https://ntrs.nasa.gov/citations/20090019087); [NTRS 20090006694](https://ntrs.nasa.gov/api/citations/20090006694/downloads/20090006694.pdf)
- Potassium citrate: ISS study used two 10 mEq pills (about 20 mEq/day); investigators concluded it decreases stone-formation risk in and soon after flight — [NASA NTRS 20090019087](https://ntrs.nasa.gov/api/citations/20090019087/downloads/20090019087.pdf)
- Rev C notes that fracture/renal stone risk may exceed BMD loss alone and that bone-countermeasure rationale — [Rev C PDF](https://standards.nasa.gov/sites/default/files/standards/NASA/C//nasa-std-3001-vol-1-rev-c-signature.pdf)

### Inferences
- Rules: BMD trend vs 95%/90% floor (infrequent DXA, so keep a tracked ARED load/frequency adherence proxy); a daily fluid/urine-volume prompt (pre-flight numeric target not found, see Gaps).

### Gaps
- Specific urine-volume target (commonly cited ~2 L/day) was NOT confirmed in sourced material.
- ARED loading protocol numbers (sets/reps/% load) not found.
- Bisphosphonate evidence from recent (2020+) trials not retrieved; most sources are 2009-2019.

## Exercise and aerobic deconditioning

### Takeaway
ISS uses ARED (resistance), CEVIS and T2 (aerobic). Standards require >=80% of pre-mission VO2max and strength. I could not source the ISS minutes/day prescription, SPRINT outcomes or Orion flywheel guidance.

### Cited Findings
- ISS devices: CEVIS (2001), ARED (Nov 2008), T2 (Aug 2009), Teal CEVIS replacement (2023) — [NASA 2025 DHA presentation, NTRS 20250008476](https://ntrs.nasa.gov/api/citations/20250008476/downloads/DHA-CE-PowerPoint%20Final%208-16.pdf)
- Standard-based floors/ratios as in the first section — [Rev C PDF](https://standards.nasa.gov/sites/default/files/standards/NASA/C//nasa-std-3001-vol-1-rev-c-signature.pdf)
- OCHMO overview brief exists: OCHMO-TB-031 Exercise Overview — [PDF](https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-031-exercise-overview.pdf) (body not read)

### Inferences
- Rules can track weekly exercise adherence versus a crew-specific plan and flag decline in estimated VO2max/strength relative to 80% baseline.

### Gaps
- Not found: ISS daily exercise minutes, SPRINT study VO2max outcomes, Orion flywheel / small-device recommendations. Search returned only generic HIIT literature. Next step: read OCHMO-TB-031 and Hayes/Ploutz-Snyder SPRINT papers.

## Cardiovascular and orthostatic intolerance

### Takeaway
Post-landing orthostatic intolerance is common, more so after long-duration flight; fluid/salt loading, compression garments and LBNP are the standard countermeasures. No sourced HRV/arrhythmia thresholds were found.

### Cited Findings
- About 30% of Shuttle astronauts unprotected by in-flight exercise and end-of-mission fluid loading when garments not worn (NASA evidence report); up to 64% fail a 10-min stand test on landing day after short missions; over 80% after long-duration (secondary) — [NASA NTRS 20150007319](https://ntrs.nasa.gov/api/citations/20150007319/downloads/20150007319.pdf); [npj Microgravity](https://www.nature.com/articles/s41526-019-0082-3.pdf)
- Pre-entry salt tablets + water to expand extracellular volume; compression garments counter hypovolemia-induced OI in ground studies — [NTRS 20150007319](https://ntrs.nasa.gov/api/citations/20150007319/downloads/20150007319.pdf)
- LBNP: 6 h of moderate LBNP training attenuated OI after 30-day head-down bedrest (bedrest, not flight) — [Honemann et al. 2024 (DLR)](https://elib.dlr.de/210353/1/h%C3%B6nemann-et-al-2024-impact-of-daily-lower-body-negative-pressure-or-cycling-followed-by-venous-constrictive-thigh-cuffs.pdf)

### Inferences
- Rules: pre-landing / pre-gravity-transition checklist (fluids, salt, garment) triggered by timeline, with post-landing stand-test escalation.

### Gaps
- In-flight HR/HRV changes and arrhythmia monitoring thresholds not found. Doses for fluid loading not extracted.

## Sleep and circadian

### Takeaway
ISS crew average roughly 6 h/night vs 8.5 h scheduled; circadian misalignment lowers sleep further; medication use prevalence not retrieved.

### Cited Findings
- Shuttle mean 5.96 h and ISS mean 6.09 h; scheduled 8.5 h (10-year study; Barger 2014 Lancet Neurol is the main source for hypnotics, figures not retrieved) — [Technology Networks summary](https://www.technologynetworks.com/neuroscience/news/ten-year-study-highlights-sleep-deficiency-and-sleep-medication-use-astronauts-282474)
- ISS sleep 6.4 +/- 1.2 h aligned vs 5.4 +/- 1.4 h misaligned (Flynn-Evans 2016) — [NTRS 20160003864](https://ntrs.nasa.gov/api/citations/20160003864/downloads/20160003864.pdf)
- Conference abstract (preliminary): 6.71 +/- 0.52 h and 83.5% efficiency on non-split-sleep nights; preflight 7.87 h, postflight 7.75 h; each hour of waking later after nominal sleep onset gave +25 min total sleep (up to 5 h) — [NTRS 20240002094](https://ntrs.nasa.gov/citations/20240002094); [NTRS 20230003916](https://ntrs.nasa.gov/citations/20230003916)
- Astronauts with <=5 h sleep performed worse on a sustained attention task (secondary) — [Frontiers Physiol 2024](https://frontiersin.org/journals/physiology/articles/10.3389/fphys.2024.1451269/pdf)
- Standard rationale: 8.5 h sleep period; avoid critical tasks at circadian nadir — [Rev C PDF](https://standards.nasa.gov/sites/default/files/standards/NASA/C//nasa-std-3001-vol-1-rev-c-signature.pdf)

### Inferences
- Candidate rule tiers (product design, not sourced thresholds): sleep <=5 h = attention-risk flag (supported by the <=5 h finding); rolling mean below approx. 6 h = routine sleep-hygiene recommendation.

### Gaps
- SSLA solid-state lighting evidence, hypnotic use rates and any official sleep-debt threshold not retrieved.

## Behavioral health and cognition

### Takeaway
NASA has the Cognition battery (10 brief tests, approx. 16 min, self-administered on ISS); no systematic decline in 25 astronauts on 6-month missions. Third-quarter phenomenon evidence is inconsistent. Communication-delay/loss produced crew detachment in Mars-500.

### Cited Findings
- Cognition: 10 brief computerized tests, under 20 minutes, feasible for self-administration — [Penn UEP](https://www.med.upenn.edu/uep/cognition.html); 2024 study of 25 astronauts: no systematic decline across 6-month missions — [Frontiers Physiol 2024](https://frontiersin.org/journals/physiology/articles/10.3389/fphys.2024.1451269/pdf)
- Little evidence for a consistent time-dependent third-quarter effect after 30+ years (Kanas, Gushin, Yusupova 2021) — [Aerosp Med Hum Perform](https://asma.kglmeridian.com/downloadpdf/view/journals/amhp/92/8/article-p689.pdf); HERA team-conflict study found no consistent third-quarter trend — [Northwestern PDF](https://atlas.northwestern.edu/wp-content/uploads/2024/02/2023-Think-like-a-team-Shared-mental-models-predict-creativity-and-problem-solving-in-space-analogs.pdf)
- Mars-500: crews showed psychological detachment from mission control during/after simulated complete communication loss, and increased autonomy — [Frontiers Psychol 2019](https://public-pages-files-2025.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2019.00811/pdf)
- 2019 review: by 40% of mission or 90 days all teams reported at least one conflict (secondary) — [Northwestern PDF](https://atlas.northwestern.edu/wp-content/uploads/2024/02/2023-Think-like-a-team-Shared-mental-models-predict-creativity-and-problem-solving-in-space-analogs.pdf)

### Inferences
- Do not hard-code a third-quarter alert; use individual-baseline mood/conflict trend detection instead.

### Gaps
- CHAPEA findings not found. Comm-delay effect sizes not extracted.

## Immune dysregulation / herpesvirus reactivation

### Takeaway
Reactivation is common (EBV, VZV, CMV shedding) but rarely symptomatic; saliva/urine PCR is the monitoring method.

### Cited Findings
- Sample-level: EBV DNA in 21% of saliva samples (14 of 17 astronauts shed), VZV in 7.4%, CMV in 32% of urine samples (8 subjects); controls EBV 3%, VZV/CMV <1% (secondary; verify) — [NTRS 20110023274](https://ntrs.nasa.gov/api/citations/20110023274/downloads/20110023274.pdf)
- Per-astronaut: 53% (47/89) shuttle and 61% (14/23) ISS astronauts shed >=1 virus; by virus shuttle to ISS: VZV 41%->65%, EBV 82%->96%, CMV 47%->61%; symptoms rare, minor — [Frontiers Microbiol 2019](https://www.frontiersin.org/articles/10.3389/fmicb.2019.00016/pdf)

### Inferences
- Primarily a monitoring/stress/sleep-linked trend; rule trigger would need clinician-defined viral-load thresholds.

### Gaps
- Countermeasure efficacy (nutrition etc.) and clinical thresholds not retrieved.

## HRP risk matrix

### Takeaway
No current Mars LxC ratings were retrieved.

### Cited Findings
- HSRB ranks 30 risks on likelihood x consequence; HSRB treats health/safety integration risk as red for Mars — [NASA NTRS 20220003642](https://ntrs.nasa.gov/api/citations/20220003642/downloads/Buckland_Daniel_730.pdf) (secondary)
- NESC data as of Nov 2021: at least 1:90 likelihood of loss of crew life for 730-day Mars mission from medical risk alone — [NTRS 20220009899](https://ntrs.nasa.gov/api/citations/20220009899/downloads/F5.2_04_Valinia.pdf) (secondary)
- 5x5 matrix in use; 2025 food risk record Rev D kept LxC scores unchanged — [NASA food risk record](https://www.nasa.gov/wp-content/uploads/2025/08/food-risk-record-rev-d-web-final.pdf)

### Gaps
- Actual risk-by-risk ratings: check Human Research Roadmap directly.

## Anomaly detection for small-N individual data

### Takeaway
BOCPD gives interpretable run-length posteriors but assumes a fixed baseline; no source found applying CUSUM/EWMA/BOCPD to astronauts. Digital-twin work for astronauts exists at framework level only.

### Cited Findings
- BOCPD tracks posterior over run length; output is change-point probability, easier to interpret than CUSUM — [Adams & MacKay, arXiv 0710.3742](https://arxiv.org/pdf/0710.3742)
- BOCPD suits series with fixed baseline; wearable review notes change-point methods often focus on raw values — [arXiv 2407.21665](https://arxiv.org/pdf/2407.21665); [arXiv baseline-shift paper](https://arxiv.org/pdf/1902.04524)
- Personalised digital twin framework for space medicine (2025) — [Heriot-Watt portal](https://researchportal.hw.ac.uk/en/publications/digital-twin-modelling-in-microgravity-a-framework-for-predictive/); human digital twins use history to define baselines — [arXiv 2508.13138](https://arxiv.org/html/2508.13138v1)

### Inferences
- Pragmatic design (not sourced as validated): per-person rolling baseline, EWMA/CUSUM for slow drifts (sleep, HR), hierarchical shrinkage priors for short histories, BOCPD for regime shifts.

### Gaps
- No astronaut/analog applications of EWMA/CUSUM/BOCPD found; no small-N specific source.

## Alarm fatigue and alert design

### Takeaway
Joint Commission (2013) frames alarm fatigue as a major safety problem; customizing thresholds/delays and tiered notification reduced alarm burden in ICUs without observed safety harm.

### Cited Findings
- Sentinel Event Alert 50 (2013): 98 alarm-related events Jan 2009-Jun 2012, 80 deaths; estimates 85-99% of alarm signals need no intervention; recommends leadership process, inventory and settings guidelines (OLD, 2013) — [Joint Commission SEA 50](https://digitalassets.jointcommission.org/api/public/content/f65e5c9df2b94000a99445e0a7877007); [Relias](https://reliasmedia.com/articles/65308-tjc-warns-about-alarm-fatigue-putting-patients-at-risk)
- Customization software cut medium-priority HR/RR/arterial pressure alarms by about 9.3%/11.8%/15.9% (Yale MICU, 2018, vendor-linked) — [PMC6193710](https://pmc.ncbi.nlm.nih.gov/articles/PMC6193710)
- Multicomponent program reduced initial notifications 68% (71 to 22 per bed-day) without safety increase (manufacturer document; caution) — [Philips](https://www.documents.philips.com/assets/20260612/87714d2cba614ecf9c96b46701049590.pdf)

### Gaps
- AAMI/ECRI guidance and IEC 60601-1-8 not retrieved; hysteresis/persistence quantitative evidence not found.

## Mars solar conjunction blackout

### Takeaway
Typical robotic blackout is about two weeks; crewed-mission disruptions may last days to months depending on band.

### Cited Findings
- 2021 event Oct 2-16; 2023 event Nov 11-25; command moratorium vs 2 days complete silence — [Space.com](https://www.space.com/nasa-mars-blackout-solar-conjunction-2021)
- NASA report: disruptions can last several days to several months for crewed missions depending on band — [NTRS 20220013418](https://ntrs.nasa.gov/citations/20220013418)
- ~26-month interval: consistent with the 2021 and 2023 dates in these sources only loosely (2021 to 2023 is about 25 months); the interval itself was not stated in a source I opened.

### Gaps
- Next conjunction dates not retrieved (the 2025 event is outside sources).

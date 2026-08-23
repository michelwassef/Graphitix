# Biomedical Example Dataset Provenance

Graphitix keeps all built-in examples in `js/shared/exampleDatasets.js`. The registry is immutable at rest and returns a deep clone for every load, so two tabs—even two tabs of the same component—never share mutable example data or Notes state.

Every example populates the component Notes section with the source paper, the relevant published figure or panel, the transformation applied by Graphitix, and whether the visualization is a direct transcription or a derived view. Derived views are identified explicitly and are never presented as digitized copies of published panels.

| Component / mode | Dataset and loaded design | Primary paper | Published figure or panel identified in Notes |
|---|---|---|---|
| Box, single and grouped | Complete ToothGrowth experiment: 60 guinea pigs, two vitamin C delivery methods, three doses | Crampton EW. *J Nutr.* 1947;33:491–504. doi:10.1093/jn/33.5.491 | Figures 1–5 (five unlettered figures) |
| Scatter, 2D / bubble | All 569 WDBC tumors: mean nuclear radius versus mean perimeter (Pearson r = 0.998); bubble size uses worst nuclear area | Street WN, Wolberg WH, Mangasarian OL. *Proc SPIE.* 1993;1905:861–870. doi:10.1117/12.148698; UCI dataset doi:10.24432/C5DW2B | Figure 1; Graphitix measured-feature views are documented as derived analyses |
| Scatter, 3D | Three measured cortical protein dimensions across six mouse experimental classes | Higuera et al. *PLoS ONE.* 2015;10:e0129126. doi:10.1371/journal.pone.0129126 | Supplementary Figure 2; Graphitix uses a documented three-protein projection |
| Scatter, grouped / grouped-X | Complete ToothGrowth repeated-animal design | Crampton 1947, above | Figures 1–5 |
| Scatter, volcano / MA | All 30 WDBC features compared between all 212 malignant and 357 benign tumors | Street et al. 1993, above | Figure 1; statistical views are documented as derived analyses |
| PCA, standard | All six Indomethacin volunteers across 11 common post-injection time points, z-standardized by time point; PC1–PC3 retain 96.29% of variance | Kwan KC et al. *J Pharmacokinet Biopharm.* 1976;4:255–280. doi:10.1007/BF01063617 | Colby & Bair 2013, Figure 1; Graphitix 2D and 3D PCA projections are documented as derived |
| PCA, grouped | 540 balanced control-mouse measurements (four classes, 135 each) across the 11 normal-learning proteins selected by Kulan and Dag; class/dilution-position mean imputation plus protein-wise z-standardization | Kulan M, Dag T. *PLoS ONE.* 2019;14:e0210954. doi:10.1371/journal.pone.0210954; source data Higuera et al. 2015, above | Figure 2 and Table 4; Graphitix PCA projection is documented as derived |
| Line, standard | Daily mean, median, 25th percentile, and 75th percentile reaction times from all 180 observations in the 18-participant chronic sleep-restriction study | Belenky G et al. *J Sleep Res.* 2003;12:1–12. doi:10.1046/j.1365-2869.2003.00337.x | Figure 3; source longitudinal profiles, with Graphitix daily summaries documented as derived |
| Line, grouped / 3D | All six Indomethacin subjects at all 11 common pharmacokinetic time points | Kwan KC et al. *J Pharmacokinet Biopharm.* 1976;4:255–280. doi:10.1007/BF01063617 | Colby & Bair 2013, Figure 1, six subject concentration-time profiles |
| Heatmap | Thirty z-standardized WDBC features across 40 balanced tumors | Street et al. 1993, above | Figure 1; z-scored heatmap is documented as derived |
| Surface | Standard MATLAB `peaks` function evaluated on a 21 × 21 grid over X and Y from −3 to 3 | MathWorks MATLAB documentation | Plot Peaks Surface example; a non-biomedical visualization benchmark |
| ROC | All 113 aSAH verification-cohort patients with paired WFNS, S100B, and NDKA predictors; expected AUCs 0.824, 0.731, and 0.612 with significant paired DeLong differences for WFNS versus each biomarker | Turck N et al. *Intensive Care Med.* 2010;36:107–115. doi:10.1007/s00134-009-1641-y; Robin X et al. *BMC Bioinformatics.* 2011;12:77 | Turck Figure 1 biomarker ROC panels; Robin Figure 3 WFNS ROC example |
| Survival | Complete 23-patient AML preliminary-analysis remission dataset | Embury SH et al. *West J Med.* 1977;126:267–272. PMID:266313 | Figure 1, remission-duration comparison |
| Histogram | Valid two-hour plasma-glucose concentrations from 763 Pima Indian women, split by diabetes within five years (497 negative, 266 positive); five zero placeholders excluded | Smith JW et al. *Proc Annu Symp Comput Appl Med Care.* 1988:261–265; UCI Pima Indians Diabetes Database | Table 1; source glucose/outcome definitions, with Graphitix distributions documented as derived |
| Pie | Direct PAM50 intrinsic-subtype counts for 870 TCGA breast tumors, comparing 159 African American with 711 White women; overall chi-square = 40.14, df = 4, p < 0.0001 | Keenan T et al. *J Clin Oncol.* 2015;33:3621–3627. doi:10.1200/JCO.2015.62.2126 | Figure 1A–B and Table 2; direct published counts |
| Venn | Curated recurrently altered genes for TCGA Luminal A, Luminal B, and Basal-like tumors | Cancer Genome Atlas Network. *Nature.* 2012;490:61–70. doi:10.1038/nature11412 | Figure 3A–C |

## Data-handling rules

- Source observations remain unchanged unless the Notes explicitly describe a deterministic subset, standardization, statistical comparison, or smoothing transformation.
- Subsets are deterministic and diagnosis-balanced where interactive responsiveness requires fewer samples.
- Paired and repeated-measure designs are preserved in the table schema whenever the component supports them.
- Example Notes are durable tab-owned state and therefore participate in the normal save, reopen, crash-recovery, and tab-isolation contracts.

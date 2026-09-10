/**
 * baselines.js - MediLance Procedure Baselines & Cost Benchmarks
 * Derived from IRDAI and NHA benchmark reports for the Indian health insurance market.
 */

const BILLING_BASELINES = {
    'Lab Report':    { avg: 2500,  label: 'Lab / Diagnostic' },
    'Prescription':  { avg: 1200,  label: 'Prescription / Medication' },
    'Discharge':     { avg: 55000, label: 'Inpatient Discharge' },
};

module.exports = { BILLING_BASELINES };

/**
 * DOL EBSA Form 5500 and 5500-SF bulk datasets (free, yearly zipped CSV, updated through the year).
 *   https://www.askebsa.dol.gov/FOIA%20Files/{year}/Latest/F_5500_SF_{year}_Latest.zip
 *   https://www.askebsa.dol.gov/FOIA%20Files/{year}/Latest/F_5500_{year}_Latest.zip
 *
 * Verified 2026-11-08 from the 2024 layouts and data (research/2026-11-08):
 *   * signer names ARE in the bulk data: SPONS_SIGNED_NAME / ADMIN_SIGNED_NAME (and *_MANUAL_SIGNED_NAME)
 *   * sponsor EIN 100%, phone 99%, business code (NAICS), participant counts
 *   * the sponsor signature is filled on only 9-16% of filings, but the plan administrator signature is filled on
 *     68-77%, and for small plans the administrator is usually the employer itself (ADMIN_NAME_SAME_SPON_IND = Y,
 *     admin EIN = sponsor EIN, or admin blank). That signer is an employer-side person: owner, president, CFO or HR.
 *   * 2024: 322,190 distinct sponsor EINs with 15-499 participants and an employer-side signer.
 *
 * Rules here:
 *   * Use the sponsor signer, else the administrator signer only when the administrator is the sponsor.
 *   * A signer name seen on 5+ different sponsor EINs is a professional signer (TPA, payroll firm): dropped.
 *   * One row per EIN: the latest plan year wins, participants are the largest plan's count.
 *   * No title in the data, so the title is "Plan signer (Form 5500)" and confidence is medium.
 */
import { ilNormName } from '../stateOwners/sos/ilLlc.js';
import { ownerName } from './owners.js';
import { blank, digits10, intOrNull, isoDate, zip5, type UniverseRow } from './types.js';

export const F5500_BASE = 'https://www.askebsa.dol.gov/FOIA%20Files';
export const F5500_TITLE = 'Plan signer (Form 5500)';
export const PROFESSIONAL_SIGNER_MIN_EINS = 5;

export type F5500Form = 'sf' | 'full';

export function f5500ZipUrl(year: number, form: F5500Form): string {
  return form === 'sf' ? `${F5500_BASE}/${year}/Latest/F_5500_SF_${year}_Latest.zip` : `${F5500_BASE}/${year}/Latest/F_5500_${year}_Latest.zip`;
}

/** Field names differ between the two forms; first non-blank wins. */
const F: Record<string, { sf: string[]; full: string[] }> = {
  ein: { sf: ['SF_SPONS_EIN'], full: ['SPONS_DFE_EIN'] },
  name: { sf: ['SF_SPONSOR_NAME'], full: ['SPONSOR_DFE_NAME'] },
  dba: { sf: ['SF_SPONSOR_DFE_DBA_NAME'], full: ['SPONS_DFE_DBA_NAME'] },
  addr1: { sf: ['SF_SPONS_LOC_US_ADDRESS1', 'SF_SPONS_US_ADDRESS1'], full: ['SPONS_DFE_LOC_US_ADDRESS1', 'SPONS_DFE_MAIL_US_ADDRESS1'] },
  city: { sf: ['SF_SPONS_LOC_US_CITY', 'SF_SPONS_US_CITY'], full: ['SPONS_DFE_LOC_US_CITY', 'SPONS_DFE_MAIL_US_CITY'] },
  state: { sf: ['SF_SPONS_LOC_US_STATE', 'SF_SPONS_US_STATE'], full: ['SPONS_DFE_LOC_US_STATE', 'SPONS_DFE_MAIL_US_STATE'] },
  zip: { sf: ['SF_SPONS_LOC_US_ZIP', 'SF_SPONS_US_ZIP'], full: ['SPONS_DFE_LOC_US_ZIP', 'SPONS_DFE_MAIL_US_ZIP'] },
  phone: { sf: ['SF_SPONS_PHONE_NUM'], full: ['SPONS_DFE_PHONE_NUM'] },
  code: { sf: ['SF_BUSINESS_CODE'], full: ['BUSINESS_CODE'] },
  year: { sf: ['SF_PLAN_YEAR_BEGIN_DATE'], full: ['FORM_PLAN_YEAR_BEGIN_DATE'] },
  participants: { sf: ['SF_TOT_ACT_PARTCP_BOY_CNT', 'SF_TOT_PARTCP_BOY_CNT'], full: ['TOT_ACTIVE_PARTCP_CNT', 'TOT_PARTCP_BOY_CNT'] },
  spons_signed: { sf: ['SF_SPONS_SIGNED_NAME', 'SF_SPONS_MANUAL_SIGNED_NAME'], full: ['SPONS_SIGNED_NAME', 'SPONS_MANUAL_SIGNED_NAME'] },
  admin_signed: { sf: ['SF_ADMIN_SIGNED_NAME', 'SF_ADMIN_MANUAL_SIGNED_NAME'], full: ['ADMIN_SIGNED_NAME', 'ADMIN_MANUAL_SIGNED_NAME'] },
  admin_name: { sf: ['SF_ADMIN_NAME'], full: ['ADMIN_NAME'] },
  admin_ein: { sf: ['SF_ADMIN_EIN'], full: ['ADMIN_EIN'] },
  admin_same: { sf: ['SF_ADMIN_NAME_SAME_SPON_IND'], full: ['ADMIN_NAME_SAME_SPON_IND'] },
};

export function f5500Field(row: Record<string, string>, form: F5500Form, key: keyof typeof F): string {
  for (const k of F[key][form]) {
    const v = String(row[k] ?? '').trim();
    if (v) return v;
  }
  return '';
}

export type SignerKind = 'sponsor' | 'admin_is_sponsor' | 'admin_third_party' | 'none';

export interface F5500Filing {
  ein: string;
  legal_name: string;
  dba: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  business_code: string | null;
  plan_year: string | null;
  participants: number | null;
  signer: string | null;
  signer_kind: SignerKind;
}

/** Employer-side signer: the sponsor's, else the administrator's when the administrator is the sponsor. */
export function f5500Filing(row: Record<string, string>, form: F5500Form): F5500Filing | null {
  const ein = f5500Field(row, form, 'ein').replace(/\D/g, '');
  const legal = f5500Field(row, form, 'name');
  if (ein.length !== 9 || !legal) return null;
  const spons = f5500Field(row, form, 'spons_signed');
  const admin = f5500Field(row, form, 'admin_signed');
  const adminEin = f5500Field(row, form, 'admin_ein').replace(/\D/g, '');
  const adminIsSponsor =
    f5500Field(row, form, 'admin_same').toUpperCase() === 'Y' || (adminEin && adminEin === ein) || !f5500Field(row, form, 'admin_name');
  let signer: string | null = null;
  let kind: SignerKind = 'none';
  if (spons) {
    signer = spons;
    kind = 'sponsor';
  } else if (admin && adminIsSponsor) {
    signer = admin;
    kind = 'admin_is_sponsor';
  } else if (admin) {
    kind = 'admin_third_party';
  }
  return {
    ein,
    legal_name: legal.replace(/\s+/g, ' ').trim(),
    dba: blank(f5500Field(row, form, 'dba')),
    address: blank(f5500Field(row, form, 'addr1')),
    city: blank(f5500Field(row, form, 'city')),
    state: blank(f5500Field(row, form, 'state')),
    zip: blank(f5500Field(row, form, 'zip')),
    phone: digits10(f5500Field(row, form, 'phone')),
    business_code: blank(f5500Field(row, form, 'code')),
    plan_year: isoDate(f5500Field(row, form, 'year')),
    participants: intOrNull(f5500Field(row, form, 'participants')),
    signer: signer ? signer.replace(/\s+/g, ' ').trim() : null,
    signer_kind: kind,
  };
}

export const signerKey = (name: string) => name.toUpperCase().replace(/[^A-Z ]/g, '').replace(/\s+/g, ' ').trim();

/**
 * Accumulates filings, one per EIN, and counts how many EINs each signer signs for.
 * Call add() for every filing (all forms, all years), then rows().
 */
export class F5500Accumulator {
  private byEin = new Map<string, F5500Filing>();
  private signerEins = new Map<string, Set<string>>();
  private maxParticipants = new Map<string, number>();

  add(f: F5500Filing): void {
    if (f.signer) {
      const k = signerKey(f.signer);
      if (k) {
        const set = this.signerEins.get(k) || new Set<string>();
        if (set.size < PROFESSIONAL_SIGNER_MIN_EINS) set.add(f.ein);
        this.signerEins.set(k, set);
      }
    }
    if (f.participants != null) this.maxParticipants.set(f.ein, Math.max(this.maxParticipants.get(f.ein) ?? 0, f.participants));
    const prev = this.byEin.get(f.ein);
    // Latest plan year wins; within a year, a filing with an employer-side signer beats one without.
    const better =
      !prev ||
      String(f.plan_year || '') > String(prev.plan_year || '') ||
      (String(f.plan_year || '') === String(prev.plan_year || '') && !prev.signer && Boolean(f.signer));
    if (better) {
      // Keep an older signer when the newest filing has none (same company, signer from an earlier year).
      const signer = f.signer || prev?.signer || null;
      const kind = f.signer ? f.signer_kind : prev?.signer ? prev.signer_kind : f.signer_kind;
      this.byEin.set(f.ein, { ...f, signer, signer_kind: kind });
    } else if (!prev.signer && f.signer) {
      this.byEin.set(f.ein, { ...prev, signer: f.signer, signer_kind: f.signer_kind });
    }
  }

  get size(): number {
    return this.byEin.size;
  }

  isProfessionalSigner(name: string): boolean {
    return (this.signerEins.get(signerKey(name))?.size ?? 0) >= PROFESSIONAL_SIGNER_MIN_EINS;
  }

  *rows(opts: { minParticipants?: number; maxParticipants?: number | null; state?: string | null } = {}): Generator<UniverseRow> {
    const min = opts.minParticipants ?? 0;
    const max = opts.maxParticipants ?? null;
    const st = opts.state ? opts.state.toUpperCase() : null;
    for (const f of this.byEin.values()) {
      const participants = this.maxParticipants.get(f.ein) ?? f.participants;
      if (participants == null || participants < min || (max != null && participants > max)) continue;
      if (st && String(f.state || '').toUpperCase() !== st) continue;
      const pro = f.signer ? this.isProfessionalSigner(f.signer) : false;
      const name = f.signer && !pro ? ownerName(f.signer, [f.city]) : { first: null, last: null, ok: false };
      yield {
        source: 'form5500',
        source_record_id: f.ein,
        legal_name: f.legal_name,
        dba: f.dba,
        address: f.address,
        city: f.city,
        state: f.state,
        zip: f.zip,
        phone: f.phone,
        ein: f.ein,
        npi: null,
        ccn: null,
        usdot: null,
        owner_first: name.first,
        owner_last: name.last,
        owner_title: name.first ? F5500_TITLE : null,
        ownership_pct: null,
        pe_flag: null,
        reit_flag: null,
        org_owners: null,
        size_employees: null,
        size_participants: participants,
        size_power_units: null,
        size_drivers: null,
        business_code: f.business_code,
        as_of: f.plan_year,
        confidence: name.ok ? 'medium' : null,
        waterfall_ready: name.ok,
        name_key: ilNormName(f.legal_name) || null,
        dba_key: f.dba ? ilNormName(f.dba) || null : null,
        zip5: zip5(f.zip),
      };
    }
  }
}

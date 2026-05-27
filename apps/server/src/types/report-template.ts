/**
 * Type definitions for Report Format Customization feature.
 */

export type ReportSectionType =
  | 'summary'
  | 'steps'
  | 'screenshots'
  | 'errors'
  | 'performance'
  | 'suggestions'
  | 'raw';

export interface ReportSection {
  id: string;
  type: ReportSectionType;
  title: string;
  enabled: boolean;
  order: number;
  config?: Record<string, unknown>;
}

export type ReportTheme = 'light' | 'dark' | 'auto';

export interface ReportStyling {
  theme: ReportTheme;
  primaryColor: string;
  logoUrl?: string;
  companyName?: string;
  footerText?: string;
}

export interface ReportTemplate {
  id: string;
  name: string;
  description?: string;
  sections: ReportSection[];
  styling: ReportStyling;
  isDefault: boolean;
  createdAt?: string;
  updatedAt?: string;
}

/** Database row shape for report_templates table */
export interface ReportTemplateRow {
  id: string;
  name: string;
  description: string | null;
  sections: string; // JSON string
  styling: string; // JSON string
  is_default: number; // 0 or 1
  created_at: string;
  updated_at: string;
}

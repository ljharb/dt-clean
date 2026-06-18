import type { DTDelta } from './getDelTa.d.ts';

declare function formatReport(delta: formatReport.ReportDelta): string;

declare namespace formatReport {
    type ReportDelta = Pick<
        DTDelta,
        'present' | 'toAdd' | 'toMove' | 'toRemove'
    >;
}

export = formatReport;

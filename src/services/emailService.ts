import { Resend } from 'resend';
import { config } from '../config/env.js';
import { logger, getErrorMessage, maskEmail } from '../utils/logger.js';
import type { FormData, JobAdData, EmailResponse } from '../types/index.js';
import type { ScraperRunResult, ProcessedJob } from '../types/scraper.types.js';

const resend = new Resend(config.resend.apiKey);

/**
 * Escapes HTML special characters to prevent XSS in email templates
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Generates the HTML email template
 */
function generateEmailHTML(jobAd: JobAdData, companyName: string): string {
  return `<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="UTF-8" />

  <style>
    body {
      font-family: 'Inter', Arial, sans-serif;
      line-height: 1.55;
      color: #111827;
      background: #f9fafb;
      margin: 0;
      padding: 0;
    }

    .container {
      max-width: 900px;
      margin: 0 auto;
      padding: 0 16px;
    }

    .header {
      background: transparent;
      color: #111827;
      padding: 0 0 24px 0;
      text-align: left;
      border-radius: 0;
    }

    .header h1 {
      font-size: 28px;
      font-weight: 600;
      margin: 0 0 8px 0;
    }

    .header p {
      margin: 0;
      font-size: 15px;
      color: #4b5563;
    }

    .content {
      background: #ffffff;
      padding: 16px;
      border-radius: 12px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.04);
    }

    .section {
      background: #ffffff;
      padding: 0;
      margin: 0 0 32px 0;
      border-radius: 0;
      box-shadow: none;
    }

    .section h2 {
      font-size: 20px;
      font-weight: 600;
      margin-bottom: 8px;
    }

    .section > p {
      color: #4b5563;
      font-size: 14px;
    }

    .job-description h2 {
      font-size: 16px;
      margin-top: 16px;
      margin-bottom: 8px;
      color: #111827;
    }

    .job-description p,
    .job-description li {
      font-size: 14px;
      color: #374151;
    }

    .job-description ul {
      padding-left: 18px;
    }

    .candidate {
      background: #f9fafb;
      padding: 16px;
      margin: 16px 0;
      border-radius: 8px;
    }

    .candidate h4 {
      margin: 0 0 8px 0;
      font-size: 15px;
    }

    .dummy-badge {
      background: #fff7ed;
      color: #9a3412;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 500;
      display: inline-block;
      margin: 12px 0;
    }

    .button {
      background: linear-gradient(90deg, #16a34a, #22c55e);
      color: white;
      padding: 12px 24px;
      text-decoration: none;
      border-radius: 999px;
      display: inline-block;
      margin-top: 16px;
      font-weight: 500;
      font-size: 14px;
    }

    .footer-note {
      font-size: 12px;
      color: #6b7280;
      margin-top: 20px;
    }
  </style>
</head>

<body>
  <div class="container">
    <div class="header">
      <h1>Tack för din förfrågan!</h1>
      <p>Vi har tagit emot ditt personalbehov och börjat arbeta på det.</p>
    </div>

    <div class="content">
      <div class="section">
        <h2>Utkast till jobbannons</h2>
        <p>Baserat på din beskrivning har vi skapat ett förslag:</p>

        <h3>${escapeHtml(jobAd.title)}</h3>
        <h4>${escapeHtml(companyName)}</h4>
        <div class="job-description">${jobAd.description}</div>

        <p><em>Du kan redigera och slutföra denna annons i företagsportalen.</em></p>
      </div>

      <div class="section">
        <h2>Potentiella kandidater</h2>
        <span class="dummy-badge">EXEMPEL – DUMMY DATA</span>
        <p>Här är några exempel på kandidatprofiler som skulle kunna passa:</p>

        <div class="candidate">
          <h4>Kandidat A (EXEMPEL)</h4>
          <p><strong>Bakgrund:</strong> 3 års erfarenhet, stark teknisk profil med fokus på projektledning</p>
          <p><strong>Kompetenser:</strong> analytisk förmåga, ledarskapsförmåga</p>
          <p><strong>Utbildning:</strong> Civilingenjör + certifieringar</p>
        </div>

        <div class="candidate">
          <h4>Kandidat B (EXEMPEL)</h4>
          <p><strong>Bakgrund:</strong> Junior profil med 2+ års erfarenhet, strategisk förståelse</p>
          <p><strong>Kompetenser:</strong> affärsutveckling, projektledning, coaching</p>
          <p><strong>Utbildning:</strong> Kandidatexamen inom relevant område</p>
        </div>

        <p><strong>OBS:</strong> Ovanstående är exempel. Riktiga kandidater visas när annonsen slutförts.</p>
      </div>

      <div class="section" style="text-align: center;">
        <h2>Nästa steg</h2>
        <ul style="text-align: left;">
          <li>Slutföra och publicera jobbannonsen</li>
          <li>Se riktiga kandidatförslag</li>
          <li>Boka intervjuer direkt i systemet</li>
        </ul>

        <a href="https://portal.rookie.se" class="button">Gå till företagsportalen</a>

        <p class="footer-note">Om du har frågor, svara på detta mejl eller ring oss.</p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Sends the confirmation email to the lead using Resend
 */
export async function sendEmailToLead(
  leadEmail: string,
  jobAd: JobAdData,
  companyName: string
): Promise<EmailResponse> {
  try {
    logger.info('Sending email to lead via Resend', { email: maskEmail(leadEmail) });

    // For testing without verified domain, send to Rookie account only
    // Original lead email included in subject for tracking
    const { data, error } = await resend.emails.send({
      from: config.resend.fromEmail,
      to: 'rookiework.dev@gmail.com',
      subject: `Tack för din förfrågan till Rookie - Vi har kandidater! [Lead: ${leadEmail}]`,
      html: generateEmailHTML(jobAd, companyName),
    });

    if (error) {
      throw error;
    }

    logger.info('Email sent successfully via Resend', {
      emailId: data?.id,
      to: leadEmail,
    });

    return data as EmailResponse;
  } catch (error) {
    logger.error('Error sending email via Resend', error);
    throw new Error(`Failed to send email: ${getErrorMessage(error)}`);
  }
}

/**
 * Generates admin alert email HTML
 */
function generateAdminAlertHTML(
  formData: FormData,
  error: unknown,
  failurePoint: string
): string {
  const errorMessage = getErrorMessage(error);
  return `<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="UTF-8" />
  <style>
    body {
      font-family: Arial, sans-serif;
      line-height: 1.6;
      color: #111827;
      background: #f9fafb;
      margin: 0;
      padding: 20px;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background: #ffffff;
      border-radius: 8px;
      padding: 24px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    .alert-header {
      background: #fee2e2;
      color: #991b1b;
      padding: 16px;
      border-radius: 6px;
      margin-bottom: 20px;
    }
    .alert-header h1 {
      margin: 0;
      font-size: 20px;
    }
    .section {
      margin-bottom: 20px;
    }
    .section h2 {
      font-size: 16px;
      color: #374151;
      margin-bottom: 8px;
      border-bottom: 2px solid #e5e7eb;
      padding-bottom: 4px;
    }
    .data-item {
      background: #f9fafb;
      padding: 8px 12px;
      margin: 4px 0;
      border-radius: 4px;
    }
    .data-item strong {
      color: #4b5563;
    }
    .error-box {
      background: #fef2f2;
      border-left: 4px solid #dc2626;
      padding: 12px;
      margin: 12px 0;
      border-radius: 4px;
    }
    .footer {
      margin-top: 24px;
      padding-top: 16px;
      border-top: 1px solid #e5e7eb;
      font-size: 12px;
      color: #6b7280;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="alert-header">
      <h1>Formularinlamning misslyckades</h1>
    </div>

    <div class="section">
      <h2>Felinformation</h2>
      <div class="error-box">
        <p><strong>Fel vid:</strong> ${escapeHtml(failurePoint)}</p>
        <p><strong>Felmeddelande:</strong> ${escapeHtml(errorMessage)}</p>
        <p><strong>Tidpunkt:</strong> ${new Date().toLocaleString('sv-SE')}</p>
      </div>
    </div>

    <div class="section">
      <h2>Formulärdata (sparad i rejected_leads)</h2>
      <div class="data-item"><strong>Namn:</strong> ${escapeHtml(formData.full_name || 'N/A')}</div>
      <div class="data-item"><strong>E-post:</strong> ${escapeHtml(formData.email || 'N/A')}</div>
      <div class="data-item"><strong>Telefon:</strong> ${escapeHtml(formData.phone || 'N/A')}</div>
      <div class="data-item"><strong>Företag:</strong> ${escapeHtml(formData.company_name || 'N/A')}</div>
      <div class="data-item"><strong>Bransch:</strong> ${escapeHtml(formData.industry || 'N/A')}</div>
      <div class="data-item"><strong>Tjänstetyp:</strong> ${escapeHtml(formData.service_type || 'N/A')}</div>
    </div>

    <div class="section">
      <h2>Beskrivning av behov</h2>
      <div class="data-item">${escapeHtml(formData.needs_description || 'N/A')}</div>
    </div>

    <div class="footer">
      <p><strong>Åtgärd:</strong> Formulärdatan har sparats i databasen (rejected_leads tabell med classification='processing_error'). Du kan granska och hantera denna inlämning manuellt via admin-portalen när den är klar.</p>
      <p><strong>Nästa steg:</strong> Kontrollera felet och försök igen manuellt om nödvändigt.</p>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Sends an alert email to admin when form processing fails
 */
export async function sendAdminAlert(
  formData: FormData,
  error: unknown,
  failurePoint: string = 'webhook_processing'
): Promise<EmailResponse | null> {
  try {
    // Check if admin alerts are configured
    if (!config.adminAlert?.email) {
      logger.warn('Admin alert email not configured, skipping alert');
      return null;
    }

    logger.info('Sending admin alert email', {
      email: config.adminAlert.email,
      failurePoint,
    });

    const { data, error: emailError } = await resend.emails.send({
      from: config.resend.fromEmail,
      to: config.adminAlert.email,
      subject: `ALERT: Form Submission Failed - ${escapeHtml(formData.company_name || 'Unknown Company')}`,
      html: generateAdminAlertHTML(formData, error, failurePoint),
    });

    if (emailError) {
      logger.error('Failed to send admin alert email', emailError);
      // Don't throw - we don't want alert failures to break the flow
      return null;
    }

    logger.info('Admin alert email sent successfully', {
      emailId: data?.id,
    });

    return data as EmailResponse;
  } catch (err) {
    logger.error('Error sending admin alert email', err);
    // Don't throw - we don't want alert failures to break the flow
    return null;
  }
}

// ============================================================================
// SCRAPER DIGEST EMAIL
// ============================================================================

/**
 * Format a date for display
 */
function formatDate(date: Date): string {
  return date.toLocaleDateString('sv-SE', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Generate HTML for a job row in the digest table
 */
function generateJobRow(job: ProcessedJob, index: number, isValid: boolean): string {
  const bg = index % 2 === 0 ? '#ffffff' : '#f9f9f9';
  const scoreColor = isValid ? '#e3f2fd' : '#ffebee';

  return `
    <tr style="background-color: ${bg}; border-bottom: 1px solid #eee;">
      <td style="padding: 8px;">
        <div style="font-weight: bold;">${escapeHtml(job.job.title)}</div>
        <div style="font-size: 11px; color: #666;">${escapeHtml(job.job.jobType || '')}</div>
      </td>
      <td style="padding: 8px;">
        <div>${escapeHtml(job.job.company)}</div>
        <div style="font-size: 11px; color: #666;">${escapeHtml(job.job.location)}</div>
      </td>
      <td style="padding: 8px;">
        <span style="display: inline-block; background: ${scoreColor}; padding: 2px 6px; border-radius: 3px; font-size: 11px; font-weight: bold;">
          Score: ${job.evaluation.score}
        </span>
        <div style="font-size: 11px; color: #888; margin-top: 4px;">${escapeHtml(job.evaluation.category)}</div>
      </td>
      <td style="padding: 8px;">
        <div style="font-size: 12px; color: #666; max-width: 300px;">
          ${escapeHtml(job.evaluation.reasoning.substring(0, 150))}${job.evaluation.reasoning.length > 150 ? '...' : ''}
        </div>
      </td>
      <td style="padding: 8px;">
        ${job.job.url ? `<a href="${encodeURI(job.job.url)}" target="_blank" style="color: #1565c0; font-size: 12px;">View</a>` : ''}
      </td>
    </tr>
  `;
}

/**
 * Generate the scraper digest HTML email
 */
function generateScraperDigestHTML(result: ScraperRunResult): string {
  const date = formatDate(result.startTime);
  const durationSec = (result.duration / 1000).toFixed(1);

  let validJobsHtml = '';
  if (result.validJobs.length > 0) {
    validJobsHtml = `
      <h3 style="color: #2e7d32; margin-top: 24px;">Valid Jobs (${result.validJobs.length})</h3>
      <table style="width: 100%; border-collapse: collapse; border: 1px solid #ccc; margin-bottom: 24px;">
        <thead>
          <tr style="background-color: #f2f2f2;">
            <th style="padding: 8px; text-align: left;">Role</th>
            <th style="padding: 8px; text-align: left;">Company</th>
            <th style="padding: 8px; text-align: left;">Score</th>
            <th style="padding: 8px; text-align: left;">Reasoning</th>
            <th style="padding: 8px; text-align: left;">Link</th>
          </tr>
        </thead>
        <tbody>
          ${result.validJobs.map((job, i) => generateJobRow(job, i, true)).join('')}
        </tbody>
      </table>
    `;
  } else {
    validJobsHtml = '<p style="color: #666;">No valid jobs found in this run.</p>';
  }

  let discardedJobsHtml = '';
  if (result.discardedJobs.length > 0) {
    discardedJobsHtml = `
      <h3 style="color: #c0392b; margin-top: 24px;">Discarded Jobs (${result.discardedJobs.length})</h3>
      <table style="width: 100%; border-collapse: collapse; border: 1px solid #ccc; margin-bottom: 24px;">
        <thead>
          <tr style="background-color: #f2f2f2;">
            <th style="padding: 8px; text-align: left;">Role</th>
            <th style="padding: 8px; text-align: left;">Company</th>
            <th style="padding: 8px; text-align: left;">Score</th>
            <th style="padding: 8px; text-align: left;">Reasoning</th>
            <th style="padding: 8px; text-align: left;">Link</th>
          </tr>
        </thead>
        <tbody>
          ${result.discardedJobs.map((job, i) => generateJobRow(job, i, false)).join('')}
        </tbody>
      </table>
    `;
  }

  let errorsHtml = '';
  if (result.errors.length > 0) {
    errorsHtml = `
      <h3 style="color: #d32f2f; margin-top: 24px;">Errors (${result.errors.length})</h3>
      <ul style="background: #ffebee; padding: 16px 32px; border-radius: 4px;">
        ${result.errors.slice(0, 10).map((e) => `<li>${escapeHtml(e.job?.title || 'Unknown')}: ${escapeHtml(e.error)}</li>`).join('')}
        ${result.errors.length > 10 ? `<li>... and ${result.errors.length - 10} more</li>` : ''}
      </ul>
    `;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      font-size: 13px;
      color: #333;
      line-height: 1.5;
      margin: 0;
      padding: 20px;
    }
    .container {
      max-width: 1000px;
      margin: 0 auto;
    }
    .header {
      border-bottom: 2px solid #333;
      padding-bottom: 10px;
      margin-bottom: 20px;
    }
    .stats {
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
      margin-bottom: 24px;
    }
    .stat-box {
      background: #f5f5f5;
      padding: 12px 20px;
      border-radius: 8px;
      text-align: center;
    }
    .stat-number {
      font-size: 24px;
      font-weight: bold;
      color: #1565c0;
    }
    .stat-label {
      font-size: 11px;
      color: #666;
      text-transform: uppercase;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2 style="margin: 0;">Job Scraper Digest - ${result.source.charAt(0).toUpperCase() + result.source.slice(1)}</h2>
      <p style="margin: 5px 0 0 0; color: #666;">${date} | Duration: ${durationSec}s</p>
    </div>

    <div class="stats">
      <div class="stat-box">
        <div class="stat-number">${result.stats.fetched}</div>
        <div class="stat-label">Fetched</div>
      </div>
      <div class="stat-box">
        <div class="stat-number">${result.stats.afterDedup}</div>
        <div class="stat-label">New Jobs</div>
      </div>
      <div class="stat-box">
        <div class="stat-number" style="color: #2e7d32;">${result.stats.valid}</div>
        <div class="stat-label">Valid</div>
      </div>
      <div class="stat-box">
        <div class="stat-number" style="color: #c0392b;">${result.stats.discarded}</div>
        <div class="stat-label">Discarded</div>
      </div>
      <div class="stat-box">
        <div class="stat-number" style="color: #d32f2f;">${result.stats.errors}</div>
        <div class="stat-label">Errors</div>
      </div>
    </div>

    ${validJobsHtml}
    ${discardedJobsHtml}
    ${errorsHtml}

    <div style="margin-top: 30px; border-top: 1px solid #eee; padding-top: 10px; text-align: center; font-size: 11px; color: #999;">
      Run ID: ${result.runId} | Generated by Rookie Job Scraper
    </div>
  </div>
</body>
</html>`;
}

/**
 * Sends the job scraper digest email
 */
export async function sendJobScraperDigestEmail(result: ScraperRunResult): Promise<EmailResponse | null> {
  try {
    const recipient = config.adminAlert?.email || 'rookiework.dev@gmail.com';

    logger.info('Sending job scraper digest email', {
      source: result.source,
      recipient,
      validJobs: result.stats.valid,
      discardedJobs: result.stats.discarded,
    });

    const { data, error } = await resend.emails.send({
      from: config.resend.fromEmail,
      to: recipient,
      subject: `Job Scraper: ${result.stats.valid} new ${result.source} jobs (${result.stats.afterDedup} processed)`,
      html: generateScraperDigestHTML(result),
    });

    if (error) {
      logger.error('Failed to send scraper digest email', error);
      return null;
    }

    logger.info('Scraper digest email sent', { emailId: data?.id });

    return data as EmailResponse;
  } catch (err) {
    logger.error('Error sending scraper digest email', err);
    return null;
  }
}

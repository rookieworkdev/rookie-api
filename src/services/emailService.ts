import { Resend } from 'resend';
import { config } from '../config/env.js';
import { logger, getErrorMessage, maskEmail } from '../utils/logger.js';
import type { FormData, JobAdData, EmailResponse } from '../types/index.js';

const resend = new Resend(config.resend.apiKey);

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

        <h3>${jobAd.title}</h3>
        <h4>${companyName}</h4>
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
      <h1>🚨 Formulärinlämning misslyckades</h1>
    </div>

    <div class="section">
      <h2>Felinformation</h2>
      <div class="error-box">
        <p><strong>Fel vid:</strong> ${failurePoint}</p>
        <p><strong>Felmeddelande:</strong> ${errorMessage}</p>
        <p><strong>Tidpunkt:</strong> ${new Date().toLocaleString('sv-SE')}</p>
      </div>
    </div>

    <div class="section">
      <h2>Formulärdata (sparad i rejected_leads)</h2>
      <div class="data-item"><strong>Namn:</strong> ${formData.full_name || 'N/A'}</div>
      <div class="data-item"><strong>E-post:</strong> ${formData.email || 'N/A'}</div>
      <div class="data-item"><strong>Telefon:</strong> ${formData.phone || 'N/A'}</div>
      <div class="data-item"><strong>Företag:</strong> ${formData.company_name || 'N/A'}</div>
      <div class="data-item"><strong>Bransch:</strong> ${formData.industry || 'N/A'}</div>
      <div class="data-item"><strong>Tjänstetyp:</strong> ${formData.service_type || 'N/A'}</div>
    </div>

    <div class="section">
      <h2>Beskrivning av behov</h2>
      <div class="data-item">${formData.needs_description || 'N/A'}</div>
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
      subject: `🚨 Form Submission Failed - ${formData.company_name || 'Unknown Company'}`,
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

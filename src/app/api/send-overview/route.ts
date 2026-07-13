import { NextResponse } from 'next/server';
import { Resend } from 'resend';

let _resend: Resend | null = null;
function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

const FROM_EMAIL = 'Lenox <lenox@volkanaistudio.com>';
const TO_EMAIL = process.env.OVERVIEW_TO_EMAIL || 'hello@volkano.dev';
const SUBJECT = 'Lenox — Your AI Intake System Overview';

const HTML_TEMPLATE = (recipientEmail: string) => `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="background:#020202;color:#e8e0d8;font-family:Inter,system-ui,sans-serif;padding:40px 20px;margin:0">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto">
    <tr>
      <td style="padding-bottom:32px">
        <p style="font-family:'Barlow Condensed',Arial,sans-serif;font-size:14px;letter-spacing:0.2em;text-transform:uppercase;color:rgba(200,204,208,0.5);margin:0">VOLKAN AI STUDIO</p>
      </td>
    </tr>
    <tr>
      <td style="padding-bottom:32px">
        <h1 style="font-size:28px;font-weight:300;color:#4df0ff;margin:0 0 12px;line-height:1.3">Lenox doesn't just answer.<br>Lenox acts.</h1>
        <p style="font-size:16px;line-height:1.6;color:rgba(232,224,216,0.8);margin:0">You just experienced it — an AI that wakes up, understands context, and executes real actions. No chatbot bubble. No form. Just action.</p>
      </td>
    </tr>
    <tr>
      <td style="padding-bottom:32px">
        <h2 style="font-size:18px;font-weight:500;color:#e8e0d8;margin:0 0 16px">What Lenox can do for your business</h2>
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:12px 0;border-bottom:1px solid rgba(232,224,216,0.08)">
              <span style="color:#4df0ff;font-size:14px">▸</span>
              <span style="font-size:15px;color:rgba(232,224,216,0.85)">Capture and qualify every lead — 24/7, no missed calls</span>
            </td>
          </tr>
          <tr>
            <td style="padding:12px 0;border-bottom:1px solid rgba(232,224,216,0.08)">
              <span style="color:#4df0ff;font-size:14px">▸</span>
              <span style="font-size:15px;color:rgba(232,224,216,0.85)">AI Intake Systems that understand your industry</span>
            </td>
          </tr>
          <tr>
            <td style="padding:12px 0;border-bottom:1px solid rgba(232,224,216,0.08)">
              <span style="color:#4df0ff;font-size:14px">▸</span>
              <span style="font-size:15px;color:rgba(232,224,216,0.85)">Email, calendar, and soon voice — automated handoffs</span>
            </td>
          </tr>
          <tr>
            <td style="padding:12px 0;border-bottom:1px solid rgba(232,224,216,0.08)">
              <span style="color:#4df0ff;font-size:14px">▸</span>
              <span style="font-size:15px;color:rgba(232,224,216,0.85)">Structured dossiers for every interaction — no more chaos</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding-bottom:24px">
        <p style="font-size:16px;line-height:1.6;color:rgba(232,224,216,0.8);margin:0 0 16px">Ready to see what Lenox can build for your business?</p>
        <a href="https://volkanaistudio.com" style="display:inline-block;padding:12px 28px;border:1px solid rgba(77,240,255,0.35);border-radius:999px;color:#4df0ff;text-decoration:none;font-size:14px;letter-spacing:0.06em;text-transform:uppercase">Book a Call</a>
      </td>
    </tr>
    <tr>
      <td style="padding-top:24px;border-top:1px solid rgba(232,224,216,0.06)">
        <p style="font-size:12px;color:rgba(232,224,216,0.35);margin:0;line-height:1.5">
          Sent by Lenox on behalf of VOLKAN AI STUDIO<br>
          Zurich, Switzerland<br>
          You received this because you requested an overview on our website.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
    }

    const resend = getResend();
    if (!resend) {
      console.warn('RESEND_API_KEY not set — skipping email send');
      return NextResponse.json({ ok: true, dev: true });
    }

    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [email],
      subject: SUBJECT,
      html: HTML_TEMPLATE(email),
    });

    if (error) {
      console.error('Resend error:', error);
      return NextResponse.json({ error: 'Failed to send' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, id: data?.id });
  } catch (err) {
    console.error('Send overview error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

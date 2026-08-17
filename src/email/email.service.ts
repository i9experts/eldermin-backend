import { Injectable, Logger } from '@nestjs/common';
import {
  SESClient, SendEmailCommand,
} from '@aws-sdk/client-ses';

export interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

@Injectable()
export class EmailService {
  private ses: SESClient;
  private fromEmail: string;
  private logger = new Logger('EmailService');

  constructor() {
    this.ses = new SESClient({
      region: process.env.AWS_REGION || 'ap-south-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
      },
    });
    this.fromEmail = process.env.SES_FROM_EMAIL || 'noreply@eldermin.com';
  }

  async sendEmail(options: EmailOptions): Promise<{ sent: boolean; messageId?: string; error?: string }> {
    const toList = Array.isArray(options.to) ? options.to : [options.to];

    try {
      const command = new SendEmailCommand({
        Source: `Eldermin ERP <${this.fromEmail}>`,
        Destination: { ToAddresses: toList },
        Message: {
          Subject: { Data: options.subject, Charset: 'UTF-8' },
          Body: {
            Html: { Data: options.html, Charset: 'UTF-8' },
            Text: { Data: options.text || options.subject, Charset: 'UTF-8' },
          },
        },
        ReplyToAddresses: options.replyTo ? [options.replyTo] : [],
      });

      // IMPORTANT: a successful response here only means SES *accepted*
      // the message into its sending pipeline - not that it was actually
      // delivered. A bounce, spam-filter rejection, or suppression-list
      // block all happen AFTER this point and would never throw here.
      // Capturing and logging the real MessageId is the only way to
      // trace what actually happened to a specific send afterward, via
      // AWS's own SES sending statistics / CloudWatch - this was
      // previously discarded entirely, silently.
      const response = await this.ses.send(command);
      this.logger.log(`Email accepted by SES for: ${toList.join(', ')} | Subject: ${options.subject} | MessageId: ${response.MessageId}`);
      return { sent: true, messageId: response.MessageId };
    } catch (err: any) {
      this.logger.error(`Email rejected by SES immediately: ${err.message}`);
      return { sent: false, error: err.message };
    }
  }

  async sendWelcomeEmail(to: string, name: string, schoolName: string, password?: string) {
    return this.sendEmail({
      to,
      subject: `Welcome to Eldermin ERP — ${schoolName}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f9fafb;padding:20px">
          <div style="background:#1e3a5f;padding:30px;text-align:center;border-radius:12px 12px 0 0">
            <h1 style="color:white;margin:0;font-size:28px">elder<span style="color:#f59e0b">min</span></h1>
            <p style="color:#93c5fd;margin:5px 0 0">Elevate. Administer. Excel.</p>
          </div>
          <div style="background:white;padding:30px;border-radius:0 0 12px 12px">
            <h2 style="color:#1e3a5f">Welcome, ${name}! 👋</h2>
            <p style="color:#4b5563">Your account for <strong>${schoolName}</strong> has been created on Eldermin ERP.</p>
            ${password ? `
            <div style="background:#f3f4f6;border-radius:8px;padding:15px;margin:20px 0">
              <p style="margin:0;color:#374151"><strong>Your login credentials:</strong></p>
              <p style="margin:5px 0;color:#374151">Email: <strong>${to}</strong></p>
              <p style="margin:5px 0;color:#374151">Password: <strong>${password}</strong></p>
              <p style="margin:10px 0 0;color:#ef4444;font-size:12px">⚠️ Please change your password after first login.</p>
            </div>` : ''}
            <div style="text-align:center;margin:25px 0">
              <a href="https://eldermin.com/login" style="background:#1e3a5f;color:white;padding:12px 30px;border-radius:8px;text-decoration:none;font-weight:bold">
                Login to Eldermin ERP →
              </a>
            </div>
            <p style="color:#6b7280;font-size:12px;text-align:center">© 2026 Eldermin. All rights reserved.</p>
          </div>
        </div>`,
    });
  }

  async sendFeeReminder(
    to: string,
    parentName: string,
    studentName: string,
    grade: string,
    amount: number,
    dueDate: string,
    schoolName: string,
    invoiceNumber: string,
  ) {
    const isOverdue = new Date(dueDate) < new Date();
    return this.sendEmail({
      to,
      subject: `${isOverdue ? '⚠️ OVERDUE' : '📢 Reminder'}: Fee Due — ${studentName} | ${schoolName}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <div style="background:#1e3a5f;padding:25px;text-align:center">
            <h1 style="color:white;margin:0;font-size:24px">elder<span style="color:#f59e0b">min</span></h1>
          </div>
          <div style="background:${isOverdue ? '#fef2f2' : '#fff'};padding:25px;border:1px solid ${isOverdue ? '#fecaca' : '#e5e7eb'}">
            <p>Dear <strong>${parentName}</strong>,</p>
            <p>This is a ${isOverdue ? '<strong style="color:#dc2626">final overdue notice</strong>' : 'friendly reminder'} for the following fee:</p>
            <div style="background:#f9fafb;border-radius:8px;padding:15px;margin:15px 0">
              <table style="width:100%;border-collapse:collapse">
                <tr><td style="padding:6px 0;color:#6b7280">Student:</td><td style="font-weight:bold">${studentName}</td></tr>
                <tr><td style="padding:6px 0;color:#6b7280">Grade:</td><td>${grade}</td></tr>
                <tr><td style="padding:6px 0;color:#6b7280">Invoice:</td><td>${invoiceNumber}</td></tr>
                <tr><td style="padding:6px 0;color:#6b7280">Amount:</td><td style="font-size:18px;font-weight:bold;color:#1e3a5f">PKR ${amount.toLocaleString()}</td></tr>
                <tr><td style="padding:6px 0;color:#6b7280">Due Date:</td><td style="color:${isOverdue ? '#dc2626' : '#374151'};font-weight:bold">${dueDate}</td></tr>
              </table>
            </div>
            <p style="color:#4b5563">Please contact the school for payment options.</p>
            <p style="color:#6b7280;font-size:12px">— ${schoolName} Finance Department</p>
          </div>
        </div>`,
    });
  }

  async sendAdmissionUpdate(
    to: string,
    parentName: string,
    studentName: string,
    status: 'accepted' | 'rejected' | 'waitlisted' | 'interview_scheduled',
    schoolName: string,
    additionalInfo?: string,
  ) {
    const configs = {
      accepted: { emoji: '🎉', title: 'Application Accepted!', color: '#10b981', msg: 'We are pleased to inform you that your child\'s application has been accepted.' },
      rejected: { emoji: '😔', title: 'Application Status Update', color: '#6b7280', msg: 'After careful consideration, we regret to inform you that we are unable to offer admission at this time.' },
      waitlisted: { emoji: '⏳', title: 'Application Waitlisted', color: '#f59e0b', msg: 'Your child\'s application has been placed on our waitlist.' },
      interview_scheduled: { emoji: '📅', title: 'Interview Scheduled', color: '#3b82f6', msg: 'We would like to invite your child for an interview.' },
    };
    const cfg = configs[status];

    return this.sendEmail({
      to,
      subject: `${cfg.emoji} Admission Update — ${studentName} | ${schoolName}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <div style="background:#1e3a5f;padding:25px;text-align:center">
            <h1 style="color:white;margin:0">elder<span style="color:#f59e0b">min</span></h1>
          </div>
          <div style="background:white;padding:25px">
            <h2 style="color:${cfg.color}">${cfg.emoji} ${cfg.title}</h2>
            <p>Dear <strong>${parentName}</strong>,</p>
            <p>${cfg.msg}</p>
            <div style="background:#f9fafb;border-radius:8px;padding:15px;margin:15px 0">
              <p><strong>Student:</strong> ${studentName}</p>
              <p><strong>School:</strong> ${schoolName}</p>
              ${additionalInfo ? `<p>${additionalInfo}</p>` : ''}
            </div>
            <p>For any queries, please contact our admissions office.</p>
            <p style="color:#6b7280">— ${schoolName} Admissions Team</p>
          </div>
        </div>`,
    });
  }

  async sendBehaviourAlert(
    to: string,
    parentName: string,
    studentName: string,
    incidentTitle: string,
    description: string,
    severity: string,
    date: string,
    schoolName: string,
  ) {
    const isSerious = ['high', 'critical'].includes(severity);
    return this.sendEmail({
      to,
      subject: `${isSerious ? '🚨 Important' : '📋 Notice'}: Behaviour Report — ${studentName}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <div style="background:#1e3a5f;padding:25px;text-align:center">
            <h1 style="color:white;margin:0">elder<span style="color:#f59e0b">min</span></h1>
          </div>
          <div style="background:white;padding:25px;border-left:4px solid ${isSerious ? '#ef4444' : '#f59e0b'}">
            <h3 style="color:#1e3a5f">Behaviour Report</h3>
            <p>Dear <strong>${parentName}</strong>,</p>
            <p>We wish to inform you about the following incident involving your child:</p>
            <div style="background:#f9fafb;border-radius:8px;padding:15px;margin:15px 0">
              <p><strong>Student:</strong> ${studentName}</p>
              <p><strong>Incident:</strong> ${incidentTitle}</p>
              <p><strong>Date:</strong> ${date}</p>
              <p><strong>Severity:</strong> <span style="color:${isSerious ? '#ef4444' : '#f59e0b'};font-weight:bold;text-transform:capitalize">${severity}</span></p>
              <p><strong>Details:</strong> ${description}</p>
            </div>
            <p>Please contact the school if you wish to discuss this further.</p>
            <p style="color:#6b7280">— ${schoolName} Student Affairs</p>
          </div>
        </div>`,
    });
  }

  async sendAssessmentResults(
    to: string,
    parentName: string,
    studentName: string,
    assessmentName: string,
    percentage: number,
    grade: string,
    schoolName: string,
  ) {
    const color = percentage >= 80 ? '#10b981' : percentage >= 60 ? '#3b82f6' : percentage >= 40 ? '#f59e0b' : '#ef4444';
    return this.sendEmail({
      to,
      subject: `📝 Results Published: ${assessmentName} — ${studentName}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <div style="background:#1e3a5f;padding:25px;text-align:center">
            <h1 style="color:white;margin:0">elder<span style="color:#f59e0b">min</span></h1>
          </div>
          <div style="background:white;padding:25px">
            <h3 style="color:#1e3a5f">Assessment Results</h3>
            <p>Dear <strong>${parentName}</strong>,</p>
            <p>Results for <strong>${assessmentName}</strong> have been published.</p>
            <div style="background:#f9fafb;border-radius:8px;padding:20px;margin:15px 0;text-align:center">
              <p style="margin:0;color:#6b7280">${studentName}</p>
              <p style="font-size:48px;font-weight:bold;color:${color};margin:10px 0">${percentage}%</p>
              <p style="margin:0;color:#374151">Grade ${grade}</p>
            </div>
            <p style="color:#6b7280">Login to Eldermin to view the detailed report card.</p>
            <div style="text-align:center">
              <a href="https://eldermin.com" style="background:#1e3a5f;color:white;padding:10px 25px;border-radius:8px;text-decoration:none">View Results</a>
            </div>
          </div>
        </div>`,
    });
  }

  async sendTarbiyahReport(
    to: string,
    parentName: string,
    studentName: string,
    overallScore: number,
    rating: string,
    period: string,
    schoolName: string,
  ) {
    const color = overallScore >= 4 ? '#10b981' : overallScore >= 3 ? '#3b82f6' : '#f59e0b';
    return this.sendEmail({
      to,
      subject: `❤️ Tarbiyah Report — ${studentName} | ${period}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <div style="background:#1e3a5f;padding:25px;text-align:center">
            <h1 style="color:white;margin:0">elder<span style="color:#f59e0b">min</span></h1>
          </div>
          <div style="background:white;padding:25px">
            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:15px;margin-bottom:20px;text-align:center">
              <p style="margin:0;font-size:14px;color:#166534">إِنَّمَا بُعِثْتُ لِأُتَمِّمَ مَكَارِمَ الْأَخْلَاقِ</p>
              <p style="margin:5px 0 0;font-size:11px;color:#16a34a;font-style:italic">"I was sent to perfect noble character." — Prophet Muhammad ﷺ</p>
            </div>
            <p>Dear <strong>${parentName}</strong>,</p>
            <p>The Tarbiyah (Character Development) report for <strong>${studentName}</strong> for <strong>${period}</strong> is ready.</p>
            <div style="background:#f9fafb;border-radius:8px;padding:20px;margin:15px 0;text-align:center">
              <p style="font-size:36px;font-weight:bold;color:${color};margin:0">${overallScore}/5</p>
              <p style="color:#374151;text-transform:capitalize;margin:5px 0">${rating}</p>
            </div>
            <p>Please login to view the detailed assessment of all 12 character traits.</p>
            <div style="text-align:center">
              <a href="https://eldermin.com" style="background:#10b981;color:white;padding:10px 25px;border-radius:8px;text-decoration:none">View Tarbiyah Report</a>
            </div>
          </div>
        </div>`,
    });
  }

  async sendCommitteeMeetingNotice(
    to: string,
    memberName: string,
    committeeName: string,
    meetingTitle: string,
    scheduledAt: string,
    venue: string | undefined,
    agenda: string | undefined,
    schoolName: string,
    extra?: {
      durationMinutes?: number;
      mode?: string;
      meetingLink?: string;
      chairperson?: string;
      minuteTaker?: string;
      agendaItems?: { order: number; topic: string; description?: string; presenter?: string; durationMinutes?: number; itemType?: string }[];
    },
  ) {
    const dt = new Date(scheduledAt);
    const dateStr = dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const timeStr = dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    const items = (extra?.agendaItems || []).slice().sort((a, b) => a.order - b.order);

    const typeColors: Record<string, string> = {
      discussion: '#3b82f6', decision: '#ef4444', information: '#6b7280', update: '#10b981',
    };
    const agendaRows = items.map((item, i) => `
      <tr style="border-bottom:1px solid #f3f4f6">
        <td style="padding:10px 8px;color:#9ca3af;font-size:13px;vertical-align:top">${i + 1}.</td>
        <td style="padding:10px 8px;vertical-align:top">
          <div style="font-weight:bold;color:#1e293b;font-size:14px">${item.topic}</div>
          ${item.description ? `<div style="color:#6b7280;font-size:12px;margin-top:2px">${item.description}</div>` : ''}
          <div style="margin-top:4px">
            ${item.itemType ? `<span style="display:inline-block;background:${typeColors[item.itemType] || '#6b7280'}22;color:${typeColors[item.itemType] || '#6b7280'};font-size:10px;font-weight:bold;text-transform:uppercase;padding:2px 8px;border-radius:10px;margin-right:6px">${item.itemType}</span>` : ''}
            ${item.presenter ? `<span style="color:#9ca3af;font-size:11px">Presented by ${item.presenter}</span>` : ''}
          </div>
        </td>
        <td style="padding:10px 8px;color:#9ca3af;font-size:12px;text-align:right;vertical-align:top;white-space:nowrap">${item.durationMinutes ? `${item.durationMinutes} min` : ''}</td>
      </tr>`).join('');

    return this.sendEmail({
      to,
      subject: `📅 Meeting Notice: ${meetingTitle} — ${committeeName}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto">
          <div style="background:#1e3a5f;padding:25px;text-align:center">
            <h1 style="color:white;margin:0">elder<span style="color:#f59e0b">min</span></h1>
          </div>
          <div style="background:white;padding:30px">
            <h2 style="color:#1e3a5f;margin-top:0">Meeting Notice</h2>
            <p>Dear <strong>${memberName}</strong>,</p>
            <p>You are invited to attend the following <strong>${committeeName}</strong> meeting:</p>

            <div style="background:#f9fafb;border-radius:10px;padding:18px;margin:18px 0">
              <h3 style="margin:0 0 12px;color:#1e3a5f">${meetingTitle}</h3>
              <table style="width:100%;border-collapse:collapse;font-size:13px">
                <tr><td style="padding:5px 0;color:#6b7280;width:120px">📅 Date</td><td style="font-weight:bold">${dateStr}</td></tr>
                <tr><td style="padding:5px 0;color:#6b7280">🕐 Time</td><td style="font-weight:bold">${timeStr}${extra?.durationMinutes ? ` (${extra.durationMinutes} min)` : ''}</td></tr>
                ${extra?.mode === 'virtual' && extra?.meetingLink ? `<tr><td style="padding:5px 0;color:#6b7280">💻 Join Online</td><td><a href="${extra.meetingLink}" style="color:#1e3a5f">${extra.meetingLink}</a></td></tr>` : ''}
                ${venue ? `<tr><td style="padding:5px 0;color:#6b7280">📍 Venue</td><td>${venue}</td></tr>` : ''}
                ${extra?.chairperson ? `<tr><td style="padding:5px 0;color:#6b7280">👤 Chair</td><td>${extra.chairperson}</td></tr>` : ''}
              </table>
            </div>

            ${items.length > 0 ? `
            <h4 style="color:#1e3a5f;margin-bottom:8px">📋 Agenda</h4>
            <table style="width:100%;border-collapse:collapse;margin-bottom:18px">${agendaRows}</table>
            ` : agenda ? `<p style="color:#374151"><strong>Agenda:</strong><br/>${agenda}</p>` : ''}

            <p style="color:#6b7280;font-size:12px">— ${schoolName}</p>
          </div>
        </div>`,
    });
  }
}

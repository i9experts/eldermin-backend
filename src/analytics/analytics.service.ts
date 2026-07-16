// ============================================================
// ANALYTICS SERVICE — AI-Powered Insights (server-side proxy)
// Eldermin ERP | NestJS
// ============================================================

import { Injectable, BadGatewayException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface AIInsight {
  category: string;
  title: string;
  finding: string;
  recommendation: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  module: string;
}

@Injectable()
export class AnalyticsService {
  constructor(private configService: ConfigService) {}

  async generateInsights(summary: any): Promise<AIInsight[]> {
    const apiKey = this.configService.get<string>('ANTHROPIC_API_KEY');
    if (!apiKey) {
      throw new InternalServerErrorException('AI insights are not configured on this server.');
    }

    const systemPrompt = `You are an expert Education ERP analyst for Eldermin ERP.
Analyze school data and return ONLY a JSON array of exactly 8 insight objects.
No markdown, no preamble, just raw JSON array.
Each insight object must have:
{
  "category": string (Admissions|Finance|Academic|Behaviour|Tarbiyah|Students),
  "title": string (short, max 8 words),
  "finding": string (what the data shows, 1-2 sentences, specific numbers),
  "recommendation": string (actionable advice, 1-2 sentences),
  "priority": "critical"|"high"|"medium"|"low",
  "module": string (which ERP module to check)
}
Base insights on actual numbers. If data is 0 or empty, note that as a finding.
Mix positive observations with concerns. Include Tarbiyah insights for Islamic schools.`;

    let response: Response;
    try {
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-5',
          max_tokens: 1500,
          system: systemPrompt,
          messages: [{
            role: 'user',
            content: `Analyze this school's ERP data and generate 8 intelligence insights:\n\n${JSON.stringify(summary, null, 2)}`,
          }],
        }),
      });
    } catch (err: any) {
      throw new BadGatewayException('Could not reach the AI insights service.');
    }

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      throw new BadGatewayException(`AI insights request failed (${response.status}): ${errBody.slice(0, 200)}`);
    }

    const result = await response.json();
    const textBlock = (result?.content || []).find((b: any) => b.type === 'text');
    const text = textBlock?.text || '[]';
    const clean = text.replace(/```json|```/g, '').trim();

    let parsed: AIInsight[];
    try {
      parsed = JSON.parse(clean);
    } catch {
      throw new InternalServerErrorException('AI response could not be parsed. Please try again.');
    }

    if (!Array.isArray(parsed)) {
      throw new InternalServerErrorException('AI response was not in the expected format.');
    }

    return parsed;
  }
}

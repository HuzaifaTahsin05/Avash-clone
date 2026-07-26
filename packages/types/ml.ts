export interface RiskPrediction {
  regionId: string;
  riskScore: number;
  riskLevel: 'low' | 'moderate' | 'high' | 'severe';
}

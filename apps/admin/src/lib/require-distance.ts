import { features } from '@tem/features';

/** Redirect to /prices when distance pricing is off (Pricing v2 pages). */
export function distancePricingOrRedirect(redirect: (path: string) => Response): Response | null {
  if (features().distancePricing) return null;
  return redirect('/prices');
}

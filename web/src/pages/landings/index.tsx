import { Navigate, useParams } from 'react-router-dom';
import { LandingV1 } from './LandingV1';
import { LandingV2 } from './LandingV2';
import { LandingV3 } from './LandingV3';
import { LandingV4 } from './LandingV4';
import { LandingV5 } from './LandingV5';
import './landings.css';

const PAGES = [LandingV1, LandingV2, LandingV3, LandingV4, LandingV5];

/** /preview/landing/:n: five directions for the landing page, to choose from. */
export function LandingPreview() {
  const n = Number(useParams().n);
  const Page = PAGES[n - 1];
  return Page ? <Page /> : <Navigate to="/preview/landing/1" replace />;
}

import ContentPage from "../ContentPage";
import { aboutPage, legalPages } from "../content";
import { pages } from "../site";

export const About = () => <ContentPage content={aboutPage} meta={pages.about} />;
export const Privacy = () => <ContentPage content={legalPages.privacy} meta={pages.privacy} />;
export const Terms = () => <ContentPage content={legalPages.terms} meta={pages.terms} />;
export const Refund = () => <ContentPage content={legalPages.refund} meta={pages.refund} />;
export const Cancellation = () => <ContentPage content={legalPages.cancellation} meta={pages.cancellation} />;

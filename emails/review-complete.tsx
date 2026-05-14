import {
  Body,
  Button,
  Container,
  Head,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';

export interface ReviewCompleteEmailProps {
  reviewerName: string;
  projectName: string;
  projectUrl: string;
  commentCount: number;
}

const PRIMARY = '#00214c';
const PRIMARY_SOFT = '#f5f7fb';
const ACCENT = '#af2c33';
const MUTED = '#5b6478';
const BORDER = '#e3e8ef';
const PAGE_BG = '#eef2f7';

export default function ReviewCompleteEmail({
  reviewerName,
  projectName,
  projectUrl,
  commentCount,
}: ReviewCompleteEmailProps) {
  const subtitle =
    commentCount > 0
      ? `View ${commentCount} ${commentCount === 1 ? 'comment' : 'comments'} in the project workspace.`
      : 'View feedback in the project workspace.';

  return (
    <Html>
      <Head />
      <Preview>{`${reviewerName} finished reviewing ${projectName}`}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Section style={iconWrap}>
            <div style={iconBadge}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke={PRIMARY}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="m9 12 2 2 4-4" />
              </svg>
            </div>
          </Section>

          <Text style={eyebrow}>
            Exposeprofi <span style={eyebrowDot}>·</span> Revision
          </Text>

          <Text style={heading}>
            <span style={headingPrimary}>{reviewerName}</span>{' '}
            <span style={headingMuted}>finished reviewing</span>{' '}
            <span style={headingAccent}>{projectName}</span>
          </Text>

          <Text style={subtitleText}>{subtitle}</Text>

          <Section style={{ textAlign: 'center', margin: '24px 0 8px' }}>
            <Button href={projectUrl} style={button}>
              Open project
            </Button>
          </Section>

          <Text style={fallbackText}>
            Or open this link directly:{' '}
            <Link href={projectUrl} style={link}>
              {projectUrl}
            </Link>
          </Text>

          <Section style={footerWrap}>
            <Text style={footer}>
              Sent automatically when a reviewer confirms they are done.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const body: React.CSSProperties = {
  backgroundColor: PAGE_BG,
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen,Ubuntu,sans-serif',
  margin: 0,
  padding: 0,
};

const container: React.CSSProperties = {
  backgroundColor: '#ffffff',
  border: `1px solid ${BORDER}`,
  borderRadius: 14,
  boxShadow: '0 4px 24px rgba(15, 30, 60, 0.06)',
  margin: '32px auto',
  maxWidth: 480,
  padding: '40px 32px 24px',
  textAlign: 'center',
};

const iconWrap: React.CSSProperties = {
  margin: '0 0 20px',
  textAlign: 'center',
};

const iconBadge: React.CSSProperties = {
  alignItems: 'center',
  backgroundColor: PRIMARY_SOFT,
  borderRadius: '50%',
  display: 'inline-flex',
  height: 56,
  justifyContent: 'center',
  width: 56,
};

const eyebrow: React.CSSProperties = {
  color: PRIMARY,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 1.6,
  margin: '0 0 10px',
  textAlign: 'center',
  textTransform: 'uppercase',
};

const eyebrowDot: React.CSSProperties = {
  color: ACCENT,
  margin: '0 4px',
};

const heading: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 600,
  lineHeight: 1.4,
  margin: '0 0 8px',
  textAlign: 'center',
};

const headingPrimary: React.CSSProperties = {
  color: PRIMARY,
};

const headingMuted: React.CSSProperties = {
  color: MUTED,
};

const headingAccent: React.CSSProperties = {
  color: ACCENT,
};

const subtitleText: React.CSSProperties = {
  color: MUTED,
  fontSize: 14,
  lineHeight: 1.6,
  margin: '0 0 8px',
  textAlign: 'center',
};

const button: React.CSSProperties = {
  backgroundColor: PRIMARY_SOFT,
  borderRadius: 999,
  color: PRIMARY,
  display: 'inline-block',
  fontSize: 14,
  fontWeight: 600,
  padding: '12px 32px',
  textDecoration: 'none',
};

const fallbackText: React.CSSProperties = {
  color: MUTED,
  fontSize: 12,
  lineHeight: 1.6,
  margin: '12px 0 0',
  textAlign: 'center',
};

const link: React.CSSProperties = {
  color: PRIMARY,
  textDecoration: 'underline',
  wordBreak: 'break-all',
};

const footerWrap: React.CSSProperties = {
  borderTop: `1px solid ${BORDER}`,
  margin: '28px 0 0',
  padding: '16px 0 0',
};

const footer: React.CSSProperties = {
  color: MUTED,
  fontSize: 11,
  lineHeight: 1.5,
  margin: 0,
  textAlign: 'center',
};

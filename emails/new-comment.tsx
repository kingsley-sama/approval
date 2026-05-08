import {
  Body,
  Button,
  Container,
  Head,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';

export interface NewCommentEmailProps {
  commenterName: string;
  commentPreview: string;
  projectName: string;
  projectUrl: string;
}

const PRIMARY = '#00214c';
const PRIMARY_SOFT = '#f1f5fb';
const ACCENT = '#af2c33';
const TEXT = '#0c1729';
const MUTED = '#5b6478';
const BORDER = '#e3e8ef';

export default function NewCommentEmail({
  commenterName,
  commentPreview,
  projectName,
  projectUrl,
}: NewCommentEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>{`${commenterName} commented on ${projectName}`}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Section style={accentBar} />
          <Section style={brandRow}>
            <Text style={brand}>
              <span style={brandDot} />
              Exposeprofi · Revision
            </Text>
          </Section>

          <Section style={contentSection}>
            <Text style={eyebrow}>New comment</Text>
            <Text style={heading}>{commenterName} commented on {projectName}</Text>
            <Section style={quote}>
              <Text style={quoteText}>{commentPreview}</Text>
            </Section>
            <Section style={{ textAlign: 'center', margin: '28px 0 8px' }}>
              <Button href={projectUrl} style={button}>
                View comment
              </Button>
            </Section>
            <Text style={fallbackText}>
              Or open this link directly:{' '}
              <Link href={projectUrl} style={link}>
                {projectUrl}
              </Link>
            </Text>
          </Section>

          <Hr style={hr} />

          <Section>
            <Text style={footer}>
              You are receiving this because you are an administrator on the Revision tool.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const body: React.CSSProperties = {
  backgroundColor: '#eef2f7',
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen,Ubuntu,sans-serif',
  margin: 0,
  padding: 0,
};

const container: React.CSSProperties = {
  backgroundColor: '#ffffff',
  border: `1px solid ${BORDER}`,
  borderRadius: 14,
  margin: '24px auto',
  maxWidth: 560,
  overflow: 'hidden',
  padding: 0,
};

const accentBar: React.CSSProperties = {
  backgroundColor: ACCENT,
  height: 4,
  margin: 0,
};

const brandRow: React.CSSProperties = {
  backgroundColor: PRIMARY,
  padding: '20px 32px',
};

const brand: React.CSSProperties = {
  alignItems: 'center',
  color: '#ffffff',
  display: 'flex',
  fontSize: 12,
  fontWeight: 700,
  gap: 8,
  letterSpacing: 1.2,
  margin: 0,
  textTransform: 'uppercase',
};

const brandDot: React.CSSProperties = {
  backgroundColor: ACCENT,
  borderRadius: '50%',
  display: 'inline-block',
  height: 8,
  marginRight: 8,
  width: 8,
};

const contentSection: React.CSSProperties = {
  padding: '32px',
};

const eyebrow: React.CSSProperties = {
  color: ACCENT,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 1.4,
  margin: '0 0 8px',
  textTransform: 'uppercase',
};

const heading: React.CSSProperties = {
  color: PRIMARY,
  fontSize: 22,
  fontWeight: 700,
  lineHeight: 1.3,
  margin: '0 0 20px',
};

const quote: React.CSSProperties = {
  backgroundColor: PRIMARY_SOFT,
  borderLeft: `3px solid ${ACCENT}`,
  borderRadius: 8,
  margin: '12px 0 8px',
  padding: '14px 18px',
};

const quoteText: React.CSSProperties = {
  color: TEXT,
  fontSize: 15,
  fontStyle: 'italic',
  lineHeight: 1.6,
  margin: 0,
  whiteSpace: 'pre-wrap',
};

const button: React.CSSProperties = {
  backgroundColor: PRIMARY,
  borderRadius: 999,
  color: '#ffffff',
  display: 'inline-block',
  fontSize: 14,
  fontWeight: 600,
  padding: '12px 28px',
  textDecoration: 'none',
};

const fallbackText: React.CSSProperties = {
  color: MUTED,
  fontSize: 13,
  lineHeight: 1.6,
  margin: '12px 0 0',
  textAlign: 'center',
};

const link: React.CSSProperties = {
  color: PRIMARY,
  textDecoration: 'underline',
  wordBreak: 'break-all',
};

const hr: React.CSSProperties = {
  borderColor: BORDER,
  margin: '0 32px',
};

const footer: React.CSSProperties = {
  color: MUTED,
  fontSize: 12,
  lineHeight: 1.5,
  margin: 0,
  padding: '20px 32px',
};

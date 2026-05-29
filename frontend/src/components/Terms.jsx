import { useEffect, useMemo, useRef } from 'react'
import {
  ThemeProvider, createTheme, CssBaseline,
  Box, Container, Typography, Paper, Button, IconButton, Chip,
} from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined'
import LockOutlinedIcon from '@mui/icons-material/LockOutlined'
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined'
import GavelOutlinedIcon from '@mui/icons-material/GavelOutlined'
import BlockOutlinedIcon from '@mui/icons-material/BlockOutlined'
import StorageOutlinedIcon from '@mui/icons-material/StorageOutlined'
import CookieOutlinedIcon from '@mui/icons-material/CookieOutlined'
import SecurityOutlinedIcon from '@mui/icons-material/SecurityOutlined'
import UpdateOutlinedIcon from '@mui/icons-material/UpdateOutlined'
import HowToRegOutlinedIcon from '@mui/icons-material/HowToRegOutlined'
import { LogoBadge } from './AppNavBar'

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#5a189a', dark: '#3c096c', light: '#9d4edd' },
    secondary: { main: '#c77dff' },
    background: { default: '#f5f3ff', paper: '#ffffff' },
    text: { primary: '#240046', secondary: '#5a189a' },
  },
  typography: { fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif' },
  shape: { borderRadius: 10 },
})

/* The single date that appears in the document. Bump this whenever the
   substantive content changes - the in-DB consent record links back to
   it so we can prove what version a user accepted. */
const LAST_UPDATED = '2026-05-22'
const VERSION = '1.0'

const C = {
  ink: '#1f1b2e',
  muted: '#6b7280',
  border: '#ede9fe',
  tint: '#faf5ff',
  brand: '#5a189a',
  deep: '#3c096c',
  pop: '#7b2cbf',
}

/* Page sections. The TOC at the top is generated from this list, so
   ordering / titles stay in one place. */
const SECTIONS = [
  { id: 'controller', icon: <VerifiedUserOutlinedIcon />, title: 'Who runs AquaGraph' },
  { id: 'data', icon: <StorageOutlinedIcon />, title: 'What personal data we hold' },
  { id: 'uses', icon: <EmailOutlinedIcon />, title: 'What we use your email for' },
  { id: 'never', icon: <BlockOutlinedIcon />, title: "What we'll never do with it" },
  { id: 'basis', icon: <GavelOutlinedIcon />, title: 'Legal basis (GDPR Art. 6)' },
  { id: 'retention', icon: <UpdateOutlinedIcon />, title: 'Where it lives, for how long' },
  { id: 'rights', icon: <HowToRegOutlinedIcon />, title: 'Your rights under GDPR' },
  { id: 'security', icon: <SecurityOutlinedIcon />, title: 'How we protect it' },
  { id: 'cookies', icon: <CookieOutlinedIcon />, title: 'Cookies and local storage' },
  { id: 'changes', icon: <UpdateOutlinedIcon />, title: 'Updates to this document' },
  { id: 'contact', icon: <EmailOutlinedIcon />, title: 'Contact & data requests' },
]

function SectionCard({ id, icon, title, children, refMap }) {
  const setRef = (el) => { if (refMap) refMap.current[id] = el }
  return (
    <Paper id={id} ref={setRef} elevation={0} sx={{
      p: { xs: 2.5, md: 3 }, borderRadius: 3, mb: 2,
      background: '#fff', border: `1px solid ${C.border}`,
      scrollMarginTop: 24,
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
        <Box sx={{
          width: 36, height: 36, borderRadius: 2,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff',
          background: `linear-gradient(135deg, ${C.brand}, ${C.pop})`,
        }}>{icon}</Box>
        <Typography sx={{
          fontSize: { xs: 17, md: 19 }, fontWeight: 800,
          color: C.ink, letterSpacing: -0.2
        }}>
          {title}
        </Typography>
      </Box>
      <Box sx={{
        fontSize: 14.5, color: '#374151', lineHeight: 1.65,
        '& p': { m: 0, mb: 1.25 },
        '& p:last-child': { mb: 0 },
        '& strong': { color: C.deep },
        '& code': {
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
          fontSize: 13, background: C.tint, px: 0.75, py: 0.15,
          borderRadius: 0.75, color: C.deep,
        },
        '& ul': { m: 0, mb: 1.25, pl: 2.5 },
        '& li': { mb: 0.5 },
      }}>
        {children}
      </Box>
    </Paper>
  )
}

export default function Terms({ onBack, onGoToRegister }) {
  /* Section refs let the TOC scroll smoothly to anchors without changing
     the URL hash (and breaking the back button). */
  const refMap = useRef({})
  const tocScroll = (id) => () => {
    const el = refMap.current[id]
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  /* Memoise mailto so the page footer never re-renders. */
  const contactMailto = useMemo(() =>
    'mailto:privacy@aquagraph.org?subject=GDPR%20data%20request', [])

  /* Make sure we land at the top when the page mounts - register flow
     navigation can otherwise reuse the previous scroll position. */
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }) }, [])

  /* The map view locks <html>/<body> overflow to keep its 100vh layout
     from scrolling; that lock persists when you navigate here via
     setState (same gotcha PipelinePage and LandingPage handle). Restore
     scroll on mount, put the previous value back on unmount so the map
     keeps its full-viewport look. */
  useEffect(() => {
    const prevBody = document.body.style.overflow
    const prevHtml = document.documentElement.style.overflow
    document.body.style.overflow = 'auto'
    document.documentElement.style.overflow = 'auto'
    return () => {
      document.body.style.overflow = prevBody
      document.documentElement.style.overflow = prevHtml
    }
  }, [])

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
        {/* Header bar - matches the auth pages' purple gradient strip */}
        <Box sx={{
          background: 'linear-gradient(135deg, #10002b 0%, #3c096c 60%, #7b2cbf 100%)',
          color: '#fff',
          px: { xs: 2, md: 4 },
          py: { xs: 2.5, md: 3 },
          position: 'sticky', top: 0, zIndex: 10,
          boxShadow: '0 4px 16px rgba(60,9,108,0.25)',
        }}>
          <Container maxWidth="md" sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {onBack && (
              <IconButton onClick={onBack} size="small" title="Back"
                sx={{
                  color: '#fff',
                  bgcolor: 'rgba(255,255,255,0.1)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.2)' },
                }}>
                <ArrowBackIcon />
              </IconButton>
            )}
            <LogoBadge size={36} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{
                fontSize: 11, letterSpacing: 1.5,
                color: '#e0aaff', textTransform: 'uppercase',
                fontWeight: 800
              }}>
                Legal
              </Typography>
              <Typography sx={{
                fontSize: { xs: 18, md: 22 }, fontWeight: 800,
                lineHeight: 1.2, letterSpacing: '-0.4px'
              }}>
                Terms &amp; Privacy
              </Typography>
            </Box>
            <Box sx={{ display: { xs: 'none', sm: 'flex' }, gap: 0.75 }}>
              <Chip size="small" label={`v${VERSION}`}
                sx={{
                  bgcolor: 'rgba(255,255,255,0.12)', color: '#fff',
                  border: '1px solid rgba(255,255,255,0.2)', fontWeight: 700
                }} />
              <Chip size="small" label={`Updated ${LAST_UPDATED}`}
                sx={{
                  bgcolor: 'rgba(255,255,255,0.12)', color: '#fff',
                  border: '1px solid rgba(255,255,255,0.2)', fontWeight: 700
                }} />
            </Box>
          </Container>
        </Box>

        <Container maxWidth="md" sx={{ pt: { xs: 3, md: 4 }, pb: 6 }}>
          {/* Intro */}
          <Paper elevation={0} sx={{
            p: { xs: 2.5, md: 3 }, borderRadius: 3, mb: 3,
            background: `linear-gradient(160deg, #fff 0%, ${C.tint} 100%)`,
            border: `1px solid ${C.border}`,
          }}>
            <Typography sx={{
              fontSize: { xs: 22, md: 28 }, fontWeight: 800,
              color: C.ink, letterSpacing: -0.4, mb: 1
            }}>
              The short version.
            </Typography>
            <Typography sx={{ color: C.muted, fontSize: 15, lineHeight: 1.6, mb: 2 }}>
              AquaGraph is a satellite-based water-pollution monitor for
              Romania's rivers. To use it as a registered user, we need an
              email address, and that's all the personal data we keep.
            </Typography>
            <Box sx={{
              display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
              gap: 1.5
            }}>
              <Box sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start' }}>
                <Box sx={{ mt: 0.25 }}>
                  <LockOutlinedIcon sx={{ color: C.brand, fontSize: 22 }} />
                </Box>
                <Box>
                  <Typography sx={{ fontSize: 13.5, fontWeight: 800, color: C.ink, lineHeight: 1.3 }}>
                    Your email is used for two things only
                  </Typography>
                  <Typography sx={{ fontSize: 12.5, color: C.muted, mt: 0.25, lineHeight: 1.5 }}>
                    (1) signing you in, and (2) sending you the reports you ask for plus very
                    rare critical service updates.
                  </Typography>
                </Box>
              </Box>
              <Box sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start' }}>
                <Box sx={{ mt: 0.25 }}>
                  <BlockOutlinedIcon sx={{ color: C.brand, fontSize: 22 }} />
                </Box>
                <Box>
                  <Typography sx={{ fontSize: 13.5, fontWeight: 800, color: C.ink, lineHeight: 1.3 }}>
                    We don't market, sell, or share
                  </Typography>
                  <Typography sx={{ fontSize: 12.5, color: C.muted, mt: 0.25, lineHeight: 1.5 }}>
                    No promotional newsletters, no third-party sharing, no analytics resale.
                    Your inbox stays quiet.
                  </Typography>
                </Box>
              </Box>
              <Box sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start' }}>
                <Box sx={{ mt: 0.25 }}>
                  <HowToRegOutlinedIcon sx={{ color: C.brand, fontSize: 22 }} />
                </Box>
                <Box>
                  <Typography sx={{ fontSize: 13.5, fontWeight: 800, color: C.ink, lineHeight: 1.3 }}>
                    You own your data
                  </Typography>
                  <Typography sx={{ fontSize: 12.5, color: C.muted, mt: 0.25, lineHeight: 1.5 }}>
                    Export it, correct it, or delete it any time - one email to us and we act
                    within 30 days.
                  </Typography>
                </Box>
              </Box>
              <Box sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start' }}>
                <Box sx={{ mt: 0.25 }}>
                  <SecurityOutlinedIcon sx={{ color: C.brand, fontSize: 22 }} />
                </Box>
                <Box>
                  <Typography sx={{ fontSize: 13.5, fontWeight: 800, color: C.ink, lineHeight: 1.3 }}>
                    Stored inside the EU
                  </Typography>
                  <Typography sx={{ fontSize: 12.5, color: C.muted, mt: 0.25, lineHeight: 1.5 }}>
                    Encrypted in transit (HTTPS) and at rest, with passwords salted-hashed -
                    never stored in plaintext.
                  </Typography>
                </Box>
              </Box>
            </Box>
          </Paper>

          {/* Table of contents - one chip per section */}
          <Box sx={{
            mb: 3, p: 2, borderRadius: 3,
            border: `1px solid ${C.border}`, bgcolor: '#fff',
          }}>
            <Typography sx={{
              fontSize: 11, fontWeight: 800, letterSpacing: 1.4,
              color: C.brand, textTransform: 'uppercase', mb: 1
            }}>
              Sections
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
              {SECTIONS.map((s, i) => (
                <Chip key={s.id} clickable
                  onClick={tocScroll(s.id)}
                  label={`${i + 1}. ${s.title}`}
                  sx={{
                    bgcolor: C.tint, color: C.deep, fontWeight: 700,
                    border: `1px solid ${C.border}`,
                    '&:hover': {
                      bgcolor: '#fff',
                      borderColor: C.brand,
                      color: C.brand,
                    },
                  }} />
              ))}
            </Box>
          </Box>

          {/* === Section bodies ============================================ */}

          <SectionCard id="controller" icon={<VerifiedUserOutlinedIcon />}
            title="Who runs AquaGraph" refMap={refMap}>
            <p>
              AquaGraph is operated by the AquaGraph team based in Romania.
              For this service we act as the <strong>data controller</strong>
              under Regulation (EU) 2016/679 (GDPR): we decide what personal
              data is collected and what it is used for.
            </p>
            <p>
              All data-protection requests can be sent to{' '}
              <a href={contactMailto} style={{ color: C.brand, fontWeight: 700 }}>
                privacy@aquagraph.org
              </a>. We aim to respond within 30 days.
            </p>
          </SectionCard>

          <SectionCard id="data" icon={<StorageOutlinedIcon />}
            title="What personal data we hold" refMap={refMap}>
            <p>
              The personal data tied to an AquaGraph account is intentionally
              minimal:
            </p>
            <ul>
              <li><strong>Email address</strong>: your sign-in identifier and
                the channel we use to send the reports listed below.</li>
              <li><strong>Username</strong>: the display name you pick at
                registration. Can be a pseudonym.</li>
              <li><strong>Region of interest</strong>: the Romanian county you
                chose at registration, so we can centre the map for you. It
                is not a precise location.</li>
              <li><strong>Salted password hash</strong>: never the password
                itself. We have no way to read your password.</li>
              <li><strong>Account timestamps</strong>: when the account was
                created, when it last signed in. Operational, not analytical.</li>
            </ul>
            <p>
              That's the whole list. We don't store device identifiers, IP
              addresses for analytics, browsing history, or any data that lets
              us profile you.
            </p>
          </SectionCard>

          <SectionCard id="uses" icon={<EmailOutlinedIcon />}
            title="What we use your email for" refMap={refMap}>
            <p>Exactly two things:</p>
            <ul>
              <li><strong>Account login.</strong> Your email is your sign-in
                identifier. It's also where we send password-reset links if
                you ask for one.</li>
              <li><strong>Reports &amp; very important AquaGraph updates.</strong>{' '}
                When you trigger a PDF report for a river, the file is
                attached to (or linked from) an email to you. We will also
                use this address to warn you about critical service issues,
                such as a data outage that affects rivers you watch,
                a security incident requiring action, or a planned shutdown.</li>
            </ul>
            <p>
              These are <strong>service emails</strong> tied to your use of
              the platform. They are <em>not</em> marketing. You cannot
              "opt out" of password-reset emails or critical incident
              notifications, because they're necessary to operate the
              account. Everything else (reports) is initiated by you.
            </p>
          </SectionCard>

          <SectionCard id="never" icon={<BlockOutlinedIcon />}
            title="What we'll never do with it" refMap={refMap}>
            <p>This list is explicit on purpose:</p>
            <ul>
              <li><strong>No marketing emails.</strong> No promotional
                campaigns, no "discover our new feature" blasts, no
                newsletters you didn't actively request.</li>
              <li><strong>No third-party sharing.</strong> We do not give,
                sell, rent, or otherwise disclose your email or any other
                personal data to advertisers, data brokers, or analytics
                resellers.</li>
              <li><strong>No profiling.</strong> We don't combine your data
                with other sources to build a behavioural profile.</li>
              <li><strong>No automated decisions with legal effect.</strong>{' '}
                The pollution scores on the map are about <em>rivers</em>,
                not people. They never produce a decision about you.</li>
              <li><strong>No transfer outside the EU/EEA.</strong> All
                personal data stays on EU-based infrastructure.</li>
            </ul>
            <p>
              The only exception to "no third-party sharing" is when we are
              legally compelled to disclose (e.g. a court order). We will
              push back where appropriate and tell you unless prohibited by
              law.
            </p>
          </SectionCard>

          <SectionCard id="basis" icon={<GavelOutlinedIcon />}
            title="Legal basis (GDPR Art. 6)" refMap={refMap}>
            <p>
              Different bits of processing rest on different legal bases.
              For transparency:
            </p>
            <ul>
              <li><strong>Account login &amp; report delivery</strong>:{' '}
                <em>Art. 6(1)(b), performance of a contract</em>. We need
                these to provide the service you signed up for.</li>
              <li><strong>Storing the salted password hash</strong>:{' '}
                <em>Art. 6(1)(f), legitimate interest</em> in keeping
                accounts secure, which is also your interest.</li>
              <li><strong>Critical service notifications</strong>:{' '}
                <em>Art. 6(1)(f), legitimate interest</em> in informing
                you about issues affecting the service.</li>
              <li><strong>Anything beyond the above</strong> would require
                your <em>explicit consent</em> under Art. 6(1)(a), asked
                for separately. Today there is nothing in this bucket.</li>
            </ul>
          </SectionCard>

          <SectionCard id="retention" icon={<UpdateOutlinedIcon />}
            title="Where it lives, for how long" refMap={refMap}>
            <p>
              Personal data is stored in our managed time-series store on EU
              infrastructure (currently Microsoft Azure, Western Europe
              region). It is encrypted at rest by the platform and in
              transit by TLS (HTTPS).
            </p>
            <p>Retention:</p>
            <ul>
              <li><strong>Active account</strong>: for as long as your
                account exists. You decide when it ends.</li>
              <li><strong>Account deletion</strong>: personal data is
                removed within <strong>30 days</strong> of your request.
                Backups containing the data roll off within an additional
                90 days.</li>
              <li><strong>Inactive accounts</strong>: if an account is
                unused for 24 months, we'll email you once, then delete it
                if you don't respond.</li>
            </ul>
            <p>
              River observations and pollution scores are <em>not</em>{' '}
              personal data (they're public environmental measurements
              keyed by river segment, not by user) and are kept
              indefinitely as the open dataset.
            </p>
          </SectionCard>

          <SectionCard id="rights" icon={<HowToRegOutlinedIcon />}
            title="Your rights under GDPR" refMap={refMap}>
            <p>
              You have the following rights regarding your personal data.
              Exercising any of them is free, and we'll act within 30 days:
            </p>
            <ul>
              <li><strong>Right of access (Art. 15)</strong>: get a copy of
                the data we hold about you.</li>
              <li><strong>Right to rectification (Art. 16)</strong>: fix
                anything inaccurate. You can also self-serve via your
                account settings.</li>
              <li><strong>Right to erasure / "right to be forgotten" (Art. 17)</strong>:{' '}
                delete your account and all associated personal data.</li>
              <li><strong>Right to restrict processing (Art. 18)</strong>:
                pause processing while a dispute is resolved.</li>
              <li><strong>Right to data portability (Art. 20)</strong>:
                receive your data in a structured, machine-readable format
                (JSON).</li>
              <li><strong>Right to object (Art. 21)</strong>: object to
                processing based on legitimate interest.</li>
              <li><strong>Right to withdraw consent (Art. 7(3))</strong>:
                where consent was the basis, withdraw it without
                affecting prior processing. Withdrawing consent for login
                effectively means deleting the account.</li>
              <li><strong>Right to lodge a complaint</strong>: with the
                Romanian Data Protection Authority{' '}
                <a href="https://www.dataprotection.ro" target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: C.brand, fontWeight: 700 }}>
                  ANSPDCP</a>, or your local EU supervisory authority.</li>
            </ul>
            <p>
              Send the request to <a href={contactMailto}
                style={{ color: C.brand, fontWeight: 700 }}>
                privacy@aquagraph.org</a> from the email tied to your account.
            </p>
          </SectionCard>

          <SectionCard id="security" icon={<SecurityOutlinedIcon />}
            title="How we protect it" refMap={refMap}>
            <p>
              Standard, plain-language summary of the security posture:
            </p>
            <ul>
              <li><strong>TLS everywhere.</strong> Every request to AquaGraph
                is served over HTTPS; plain-HTTP traffic is rejected.</li>
              <li><strong>Salted-hashed passwords.</strong> We use bcrypt
                with per-user salts. The original password never leaves
                your browser in any recoverable form, and we cannot
                display it back to you.</li>
              <li><strong>Bearer tokens, not session cookies.</strong> Login
                returns a token your browser stores locally; logging out
                destroys it. No third-party can intercept it via a
                cross-site request.</li>
              <li><strong>Least privilege on storage.</strong> The
                application connects to the store with a role that can
                only read/write the tables it needs.</li>
              <li><strong>Backups are encrypted</strong> and live in the
                same EU region as the live store.</li>
            </ul>
            <p>
              No system is perfectly secure, but we follow current good
              practice and disclose any incident affecting your data
              promptly, as required by GDPR (Art. 33–34).
            </p>
          </SectionCard>

          <SectionCard id="cookies" icon={<CookieOutlinedIcon />}
            title="Cookies and local storage" refMap={refMap}>
            <p>
              AquaGraph is intentionally cookie-light. We use:
            </p>
            <ul>
              <li><strong>One <code>localStorage</code> entry</strong>{' '}
                (<code>aq_token</code>): your bearer token, set at login
                and removed at logout. Strictly necessary to keep you
                signed in.</li>
              <li><strong>No third-party cookies.</strong> No Google
                Analytics, no Facebook Pixel, no ad network trackers.</li>
              <li><strong>No tracking pixels in emails.</strong> Service
                emails are plain content; we do not embed beacons that
                report opens or clicks back to us.</li>
            </ul>
            <p>
              Because the only stored item is strictly necessary, GDPR does
              not require a cookie banner, but you should know it's there.
            </p>
          </SectionCard>

          <SectionCard id="changes" icon={<UpdateOutlinedIcon />}
            title="Updates to this document" refMap={refMap}>
            <p>
              When we change anything substantive in this document we'll
              bump the version (top-right of the header) and update the
              "Last updated" date. If the change affects how we use your
              data, we will email registered users from the address tied to
              their account and ask for re-consent where the law requires.
            </p>
            <p>Current version: <code>{VERSION}</code> · last updated{' '}
              <code>{LAST_UPDATED}</code>.</p>
          </SectionCard>

          <SectionCard id="contact" icon={<EmailOutlinedIcon />}
            title="Contact & data requests" refMap={refMap}>
            <p>
              All privacy questions, GDPR rights requests, and security
              reports go to:
            </p>
            <p style={{ textAlign: 'center', margin: '1rem 0' }}>
              <a href={contactMailto}
                style={{
                  display: 'inline-block',
                  padding: '0.75rem 1.5rem',
                  borderRadius: 8,
                  background: `linear-gradient(135deg, ${C.brand}, ${C.pop})`,
                  color: '#fff',
                  fontWeight: 800,
                  textDecoration: 'none',
                  boxShadow: '0 6px 18px rgba(90,24,154,0.25)',
                }}>
                lesedorucalin@yahoo.com
              </a>
            </p>
            <p>
              We acknowledge requests within 5 business days and complete
              them within 30 days. If we need longer (max 60 more days for
              complex cases under Art. 12(3)), we'll tell you why.
            </p>
          </SectionCard>

          {/* Footer actions */}
          <Box sx={{
            display: 'flex', flexDirection: { xs: 'column', sm: 'row' },
            gap: 1.5, justifyContent: 'space-between', alignItems: 'center',
            mt: 4, mb: 1
          }}>
            {onBack && (
              <Button variant="outlined" startIcon={<ArrowBackIcon />} onClick={onBack}
                sx={{
                  color: C.brand, borderColor: C.brand,
                  '&:hover': { borderColor: C.deep, background: C.tint },
                }}>
                Back
              </Button>
            )}
            {onGoToRegister && (
              <Button variant="contained" onClick={onGoToRegister}
                sx={{
                  background: `linear-gradient(135deg, ${C.brand}, ${C.pop})`,
                  fontWeight: 700, px: 3, py: 1.1,
                  boxShadow: '0 6px 18px rgba(90,24,154,0.25)',
                  '&:hover': { background: `linear-gradient(135deg, ${C.deep}, ${C.brand})` },
                }}>
                I've read this. Back to registration
              </Button>
            )}
          </Box>
        </Container>
      </Box>
    </ThemeProvider>
  )
}

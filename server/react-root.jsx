const HomeScreen = () => (
  <section id="homeScreen" className="flex-row justify-center align-center screen home hidden">
    <div className="panel flex-column flex-between flex-gap-md justify-center align-center">
      <div className="command-logo">
        <h1>GRID OPS</h1>
      </div>
      <p className="eyebrow">TACTICAL COMMAND / SECTOR 09</p>
      <p className="home-intro">Outthink. Outmaneuver. Open fire.</p>
      <p className="home-description">Deploy six units. Read the battlefield. Find the enemy before they find you.</p>
      <div className="flex-column action-area">
        <div className="flex-row action-area--track">
          <div className="flex-row align-center justify-center flex-gap-md action-area--panel action-area--buttons">
            <button id="newGameBtn" className="button primary">
              <span className="material-symbols-outlined">
                military_tech
              </span> NEW DEPLOYMENT
            </button>
          </div>
          <div className="flex-column flex-around flex-gap-md action-area--panel action-area--callsign">
            <div className="form-field-group">
              <label className="form-label" htmlFor="playerName">
                enter your callsign
              </label>
              <div className="input-shell">
                <input
                  id="playerName"
                  className="input-field"
                  maxLength={20}
                />
              </div>
            </div>
            <div className="flex-grow grid-12">
              <button id="cancelCallsignBtn" aria-label="Back to main menu" className="col-span-2 button secondary large">
                <span className="material-symbols-outlined">
                  arrow_back
                </span>
              </button>
              <button id="startDeploymentBtn" className="col-span-10 button primary ">
                continue
              </button>
            </div>
          </div>
          <div className="grid-12 flex-column flex-around flex-gap-md action-area--panel action-area--game-mode">
            <div id="soloOptions" className="difficulty-options col-span-12" aria-label="Computer difficulty">
              <span>AI difficulty</span>
              <button className="chip selected" data-difficulty="low" aria-pressed="true">Recruit</button>
              <button className="chip" data-difficulty="medium" aria-pressed="false">Veteran</button>
              <button className="chip" data-difficulty="hard" aria-pressed="false">Elite</button>
            </div>
            <button id="cancelModeBtn" aria-label="Back to callsign" className="col-span-2 button secondary ">
              <span className="material-symbols-outlined">
                arrow_back
              </span>
            </button>
            <button id="startSoloBtn" className="col-span-5 button primary " data-mode="solo">
              Solo operation
            </button>
            <button id="continueBtn" className="col-span-5 button primary " data-mode="pvp">
              Tactical link <br />
              <small>Play online with another human</small>
            </button>
          </div>
        </div>
      </div>
      <div id="homeStatus" className="align-stretch status-panel">
        <span id="homeStatusMessage" className="status-line"></span>
      </div>
    </div>
  </section>
);
const PvpScreen = () => (
  <section id="pvpScreen" className="flex-row justify-center align-center screen home hidden">
    <div className="panel flex-column flex-between flex-gap-md justify-center align-center">
      <div className="panel-logo"></div>
      <div className="pvp-lobby flex-column flex-gap-md">
        <div className="flex-row flex-between align-center pvp-lobby__header">
          <button id="pvpBackBtn" className="button secondary large">
            <span className="material-symbols-outlined">arrow_back</span>
            Back
          </button>
        </div>
        <div id="pvpStatus" className="align-stretch status-panel">
          <ul id="playerList" className="player-list"></ul>
        </div>
      </div>
    </div>
  </section>
);
const AXIS_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
const AXIS_NUMBERS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
const GRID_COORDINATES = AXIS_LETTERS.flatMap((letter) =>
  AXIS_NUMBERS.map((number) => `${letter}${number}`),
);

const MapGrid = ({ boardId, showAxis = false, showCellCoords = false }) => (
  <div className="map-shell">
    <div
      id={boardId}
      className="grid board board-primary"
    >
      {AXIS_NUMBERS.map((number) => (
        <React.Fragment key={`row-${number}`}>
          {AXIS_LETTERS.map((letter) => {
            const coord = `${letter}${number}`;
            return (
              <div
                key={coord}
                className="cell"
                data-coord={coord}
                aria-label={`Empty sector ${coord}`}
              >
                {showCellCoords && <span className="cell-coord">{coord}</span>}
              </div>
            );
          })}
        </React.Fragment>
      ))}
    </div>
  </div>
);
const TopRail = ({ }) => (
  <div className="col-span-12 top-rail flex-row flex-between flex-gap-md justify-start">
    <div className="command-logo" alt="GridOps logo" />
    <div className="top-rail-title"></div>
  </div>
);
const OverlayBanner = () => {
  const [message, setMessage] = React.useState('');
  const [visible, setVisible] = React.useState(false);
  const timeoutRef = React.useRef(null);

  const hideBanner = React.useCallback(() => {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setVisible(false);
  }, []);

  const showBanner = React.useCallback(
    (text, duration = 2400) => {
      if (!text) {
        hideBanner();
        setMessage('');
        return;
      }
      hideBanner();
      setMessage(text);
      setVisible(true);
      if (duration > 0) {
        timeoutRef.current = window.setTimeout(() => {
          setVisible(false);
          timeoutRef.current = null;
        }, duration);
      }
    },
    [hideBanner],
  );

  React.useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    window.GridOps = window.GridOps || {};
    const previousShow = window.GridOps.showOverlayBanner;
    const previousHide = window.GridOps.hideOverlayBanner;
    window.GridOps.showOverlayBanner = showBanner;
    window.GridOps.hideOverlayBanner = hideBanner;
    return () => {
      if (window.GridOps.showOverlayBanner === showBanner) {
        window.GridOps.showOverlayBanner = previousShow;
      }
      if (window.GridOps.hideOverlayBanner === hideBanner) {
        window.GridOps.hideOverlayBanner = previousHide;
      }
    };
  }, [hideBanner, showBanner]);

  return (
    <div
      id="overlayBanner"
      className={`overlay-banner${visible ? ' overlay-banner--visible' : ''} message`}
      aria-live="assertive"
    >
      <span className="overlay-banner__message">{message}</span>
    </div>
  );
};

const MatchRequestDialog = () => (
  <div id="matchRequestModal" className="modal hidden" role="dialog" aria-modal="true" aria-labelledby="matchRequestMessage">
    <div className="modal-content match-request">
      <p id="matchRequestMessage" className="modal-message"></p>
      <div className="modal-actions flex-row flex-gap-sm justify-center">
        <button id="matchConfirmBtn" type="button" className="button primary">
          Confirm
        </button>
        <button id="matchDenyBtn" type="button" className="button secondary">
          Deny
        </button>
      </div>
    </div>
  </div>
);

const MatchConnectingDialog = () => (
  <div id="matchConnectingModal" className="modal hidden" role="status" aria-live="polite">
    <div className="modal-content match-connecting flex-column align-center">
      <div id="matchConnectingLoader" className="match-connecting__loader" aria-hidden="true"></div>
      <p id="matchConnectingMessage" className="modal-message"></p>
    </div>
  </div>
);

const WaitingForOpponentDialog = () => (
  <div id="waitingForOpponentModal" className="modal hidden" role="status" aria-live="polite">
    <div className="modal-content waiting flex-column align-center">
      <p id="waitingForOpponentMessage" className="modal-message"></p>
      <button
        id="waitingForOpponentRestartBtn"
        type="button"
        className="button primary hidden"
      >
        Restart
      </button>
    </div>
  </div>
);

const ReconnectDialog = () => (
  <div id="reconnectModal" className="modal hidden" role="dialog" aria-modal="true" aria-labelledby="reconnectMessage">
    <div className="modal-content match-request">
      <p id="reconnectMessage" className="modal-message"></p>
      <div className="modal-actions flex-row flex-gap-sm justify-center">
        <button id="reconnectConfirmBtn" type="button" className="button primary">
          Affirmative
        </button>
        <button id="reconnectDenyBtn" type="button" className="button secondary">
          Negative
        </button>
      </div>
    </div>
  </div>
);

const PostGameDialog = () => (
  <div id="postGameModal" className="modal hidden" role="dialog" aria-modal="true" aria-labelledby="postGameTitle">
    <div className="modal-content post-game">
      <h2 id="postGameTitle" className="modal-title"></h2>
      <p id="postGameMessage" className="modal-message"></p>
      <p id="postGamePrompt" className="modal-prompt"></p>
      <p id="postGameStatus" className="modal-status" aria-live="polite"></p>
      <div className="modal-actions flex-row flex-gap-sm justify-center">
        <button id="playAgainBtn" type="button" className="button primary">
          Yes
        </button>
        <button id="returnHomeBtn" type="button" className="button secondary">
          No
        </button>
      </div>
    </div>
  </div>
);

const AttackBoardPanel = () => (
  <div id="attack-board" className="panel attack-board-panel flex-column flex-gap-md">
    <div className="board-heading"><div><span className="eyebrow">02 / OFFENSE</span><h2>Enemy sector</h2></div><span className="signal">LIVE INTEL</span></div>
    <MapGrid boardId="attackBoard" showAxis={false} showCellCoords />
    <p id="targetHint" className="board-hint">Select a sector, then confirm your strike.</p>
    <button id="fireBtn" className="large align-stretch red disabled" disabled>
      Select a target
    </button>
  </div>
);

const RightRail = ({ mode }) => {
  const vehiclesPanel = (
    <div className="panel vehicles-panel flex-column flex-around align-center flex-gap-md">
      <div className="board-heading"><div><span className="eyebrow">YOUR LOADOUT</span><h2>Deploy forces</h2></div></div>
      <p id="deploymentProgress" className="board-hint" aria-live="polite">0 / 6 units deployed</p>
      <div id="unitList" className="unit-list flex-column align-stretch flex-gap-sm"></div>
      <div className="orientation-toggle flex-row flex-between align-stretch  align-center">
        <div className="panel--head"><span>Orientation</span></div>
        <div className="flex flex-around flex-gap-sm">
          <button aria-label="Horizontal orientation" aria-pressed="true" data-orientation="horizontal" className="button secondary small selected">
            Horizontal
          </button>
          <button aria-label="Vertical orientation" aria-pressed="false" data-orientation="vertical" className="button secondary small">
            Vertical
          </button>
        </div>
      </div>
      <div className="panel--divider"></div>
      <div className="flex-column flex-between flex-gap-sm">
        <button id="randomizeBtn" className="button small">
          Random Layout
        </button>
        <button id="clearBoardBtn" className="button small">
          Reset Layout
        </button>
      </div>
    </div>
  );
  const attackPanel = <AttackBoardPanel />;
  const statusPanel = (
    <div className="panel status-panel flex-grow flex-column flex-gap-sm">
      <div id="statusFeed" className="status-feed"></div>
    </div>
  );
  const readyButton = (
    <button id="readyBtn" className="primary red disabled" disabled>
      Deploy!
    </button>
  );
  const abortButton = <button id="abort-campaign" className="button small">Abort</button>;

  const contentByMode = {
    setup: [vehiclesPanel, readyButton],
    game: [attackPanel, statusPanel, abortButton],
  };

  return (
    <div className="flex-column flex-gap-md right-rail">
      {contentByMode[mode]}
    </div>
  );
};

const SetupScreen = () => (
  <section id="setupScreen" className="flex-row justify-center align-center screen hidden">
    <div className="grid-12">
      <TopRail />
      <div className="col-span-9 map-area">
        <div className="board-heading"><div><span className="eyebrow">01 / PREPARATION</span><h2>Your deployment zone</h2></div></div>
        <p className="board-hint">Select a unit, then a sector. R rotates. Drag to reposition.</p>
        <MapGrid boardId="placementBoard" label="Deployment Grid" showCellCoords />
      </div>
      <div className="col-span-3">
        <RightRail mode="setup" />
      </div>
    </div>
  </section >
);
const GameScreen = () => (
  <section id="gameScreen" className="screen hidden">
    <div className="combat-layout">
      <TopRail />
      <div className="mission-hud"><span id="turnBanner" role="status">Awaiting orders</span><span id="combatStats">0 shots · 0% accuracy</span></div>
      <div className="combat-boards">
        <AttackBoardPanel />
        <div className="panel defense-panel">
          <div className="board-heading"><div><span className="eyebrow">01 / DEFENSE</span><h2>Your sector</h2></div><span id="fleetStatus" className="signal">6 UNITS ACTIVE</span></div>
          <MapGrid boardId="playerBoard" showCellCoords />
          <div className="board-legend"><span>× Hit</span><span>• Miss</span><span>⌖ Selected target</span></div>
        </div>
      </div>
      <div className="combat-footer panel"><div><span className="eyebrow">FIELD REPORT</span><div id="statusFeed" className="status-feed" role="log" aria-live="polite" aria-relevant="additions"></div></div><button id="abortMissionBtn" className="button secondary small">End mission</button></div>
    </div>
  </section>
);

const GamePreferences = () => (
  <div className="preferences">
    <span className="eyebrow">GRIDOPS / COMMAND LINK</span>
    <div className="preference-controls">
      <button id="soundToggle" className="button secondary small" aria-pressed="false">Sound on</button>
      <label className="volume-control">Volume <input id="sfxVolume" type="range" min="0" max="100" defaultValue="55" /></label>
      <details className="help-menu"><summary>How to play</summary><div className="help-content"><h2>Every sector counts.</h2><p>Place all six units manually or use Random Layout. Units cannot overlap. Click an occupied sector to pick up its unit.</p><p>Take turns firing one shot. Destroy all six enemy units to win. Hits are ×, misses are •.</p><p>Keyboard: Tab to a board, arrow keys to navigate, Enter or Space to select. R rotates during deployment. Confirm attacks with the Fire button.</p><p>Recruit searches randomly. Veteran follows hits. Elite also tracks the direction of damaged units. No difficulty sees hidden units.</p></div></details>
    </div>
  </div>
);

const StyleGuide = () => (
  <div className="style-page">
    <header className="style-hero panel">
      <div className="panel--head">GridOps UI Test Page</div>
      <div className="panel--divider"></div>
      <div className="style-hero__content">
        <div className="style-hero__brand">
          <div className="command-logo style-hero__logo" aria-hidden="true"></div>
          <div>
            <h2>UI Elements</h2>
            <p className="style-subtitle">Use this page to verify layout, spacing, and component states.</p>
          </div>
        </div>
        <div className="style-hero__meta">
          <div className="style-meta">
            <span className="style-meta__label">Status</span>
            <span className="style-meta__value">Operational</span>
          </div>
          <div className="style-meta">
            <span className="style-meta__label">Build</span>
            <span className="style-meta__value">UI Test Harness</span>
          </div>
        </div>
      </div>
    </header>

    <section className="style-grid">
      <div className="panel style-card style-card--full">
        <div className="panel--head">Buttons</div>
        <div className="panel--divider"></div>
        <div className="style-stack">
          <div className="style-row flex-row flex-wrap flex-gap-sm">
            <button className="button primary">Default</button>
            <button className="button primary is-hover">Primary Hover</button>
            <button className="button primary disabled" disabled>Disabled</button>
            <button className="button primary">
              <span className="material-symbols-outlined">bolt</span>
              With Icon
            </button>
            <button className="button primary large">Large</button>
            <button className="button primary small">Small</button>
          </div>
          <div className="style-row flex-row flex-wrap flex-gap-sm">
            <button className="button secondary">Default</button>
            <button className="button secondary is-hover">Secondary Hover</button>
            <button className="button secondary disabled" disabled>Disabled</button>
            <button className="button secondary">
              <span className="material-symbols-outlined">radar</span>
              Scanner
            </button>
            <button className="button secondary  large">Large</button>
            <button className="button secondary  small">Small</button>
          </div>
          <div className="style-row flex-row flex-wrap flex-gap-sm">
            <button className="button red">Default</button>
            <button className="button red is-hover">Red Hover</button>
            <button className="button red disabled" disabled>Disabled</button>
            <button className="button secondary">
              <span className="material-symbols-outlined">radar</span>
              Scanner
            </button>
            <button className="button  red large">Large</button>
            <button className="button  red small">Small</button>
          </div>
        </div>
      </div>

      <div className="panel style-card">
        <div className="panel--head">Form Fields</div>
        <div className="panel--divider"></div>
        <div className="style-stack">
          <div className="form-field-group">
            <label className="form-label" htmlFor="style-call-sign">Callsign</label>
            <div className="input-shell">
              <input id="style-call-sign" className="input-field" defaultValue="Viper One" />
            </div>
          </div>
          <div className="form-field-group">
            <label className="form-label" htmlFor="style-frequency">Channel</label>
            <div className="input-shell">
              <input id="style-frequency" className="input-field" placeholder="Enter code" />
            </div>
          </div>
        </div>
      </div>

      <div className="panel style-card">
        <div className="panel--head">Status Panels</div>
        <div className="panel--divider"></div>
        <div className="status-panel">
          <div className="status-item status-success">
            <span>Deployment complete</span>
            <strong>OK</strong>
          </div>
          <div className="status-item status-warning">
            <span>Signal interference detected</span>
            <strong>WARN</strong>
          </div>
          <div className="status-item status-danger">
            <span>Shield breach in sector A7</span>
            <strong>ALERT</strong>
          </div>
          <div className="status-item status-info">
            <span>Awaiting tactical input</span>
            <strong>INFO</strong>
          </div>
          <div className="status-item status-round">
            <span>Round 3</span>
          </div>
        </div>
      </div>

      <div className="panel style-card">
        <div className="panel--head">Lists & Panels</div>
        <div className="panel--divider"></div>
        <ul className="player-list">
          <li className="player-row">
            <span className="player-row__callsign">Falcon</span>
            <span className="player-row__action">Ready</span>
          </li>
          <li className="player-row">
            <span className="player-row__callsign">Specter</span>
            <span className="player-row__action">Idle</span>
          </li>
          <li className="player-row empty">No operators online</li>
        </ul>
      </div>

      <div className="panel style-card style-card--wide">
        <div className="panel--head">Map Grid</div>
        <div className="panel--divider"></div>
        <div className="style-map">
          <MapGrid boardId="styleBoard" showCellCoords />
        </div>
      </div>

      <div className="panel style-card">
        <div className="panel--head">Modal</div>
        <div className="panel--divider"></div>
        <div className="modal style-preview">
          <div className="modal-content">
            <p className="modal-message">Confirm tactical transfer?</p>
            <div className="modal-actions">
              <button className="button primary">Confirm</button>
              <button className="button secondary">Cancel</button>
            </div>
          </div>
        </div>
      </div>

      <div className="panel style-card">
        <div className="panel--head">Overlay Banner</div>
        <div className="panel--divider"></div>
        <div className="overlay-banner overlay-banner--visible style-preview">
          <span className="overlay-banner__message">Strike Authorized</span>
        </div>
      </div>
    </section>
  </div>
);


function AppShell() {
  const isStylePage = typeof window !== 'undefined' && window.location?.pathname === '/style';

  React.useEffect(() => {
    if (isStylePage) {
      return;
    }
    if (typeof window !== 'undefined' && window.GridOps && typeof window.GridOps.initializeApp === 'function') {
      window.GridOps.initializeApp();
    } else {
      console.error('GridOps initializeApp unavailable.');
    }
  }, [isStylePage]);

  return (
    <div id="app" className="app">
      <div className="crt-overlay" aria-hidden="true"></div>
      <GamePreferences />
      <OverlayBanner />
      {isStylePage ? (
        <main className="screens style-shell">
          <StyleGuide />
        </main>
      ) : (
        <>
          <main className="screens flex justify-center align-center">
            <HomeScreen />
            <PvpScreen />
            <SetupScreen />
            <GameScreen />
          </main>
          <MatchRequestDialog />
          <MatchConnectingDialog />
          <WaitingForOpponentDialog />
          <ReconnectDialog />
          <PostGameDialog />
        </>
      )}
    </div>
  );
}

const rootElement = document.getElementById('root');
const root = ReactDOM.createRoot(rootElement);
root.render(<AppShell />);

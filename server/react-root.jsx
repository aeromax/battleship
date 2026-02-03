const HomeScreen = () => (
  <section id="homeScreen" className="flex-row justify-center align-center screen home hidden">
    <div className="panel flex-column flex-between flex-gap-md justify-center align-center">
      <div className="command-logo">
        <h1>GRID OPS</h1>
      </div>
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
              <button id="cancelCallsignBtn" className="col-span-2 button secondary large">
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
            <button id="cancelModeBtn" className="col-span-2 button secondary ">
              <span className="material-symbols-outlined">
                arrow_back
              </span>
            </button>
            <button id="startSoloBtn" className="col-span-5 button primary " data-mode="solo">
              Human vs. Computer
            </button>
            <button id="continueBtn" className="col-span-5 button primary " data-mode="pvp">
              tactical link <br />
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
    <div id="topRailTitle" className="top-rail-title" aria-live="polite"></div>
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
  <div id="matchRequestModal" className="modal hidden" role="dialog" aria-modal="true">
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
  <div id="reconnectModal" className="modal hidden" role="dialog" aria-modal="true">
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

const AttackBoardPanel = () => (
  <div id="attack-board" className="panel attack-board-panel flex-column flex-between flex-gap-md">
    <MapGrid boardId="attackBoard" showAxis={false} showCellCoords />
    <button id="fireBtn" className="large align-stretch red disabled" disabled>
      Fire!
    </button>
  </div>
);

const RightRail = ({ mode }) => {
  const vehiclesPanel = (
    <div className="panel vehicles-panel flex-column flex-around align-center flex-gap-md">
      <div id="unitList" className="unit-list flex-column align-stretch flex-gap-sm"></div>
      <div className="orientation-toggle flex-row flex-between align-stretch  align-center">
        <div className="panel--head"><span>Orientation</span></div>
        <div className="flex flex-around flex-gap-sm">
          <button data-orientation="horizontal" className="button secondary small selected">
            <span className="material-symbols-outlined">width</span>
          </button>
          <button data-orientation="vertical" className="button secondary small">
            <span className="material-symbols-outlined">height</span>
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
        <MapGrid boardId="placementBoard" label="Deployment Grid" showCellCoords />
      </div>
      <div className="col-span-3">
        <RightRail mode="setup" />
      </div>
    </div>
  </section >
);
const GameScreen = () => (
  <section id="gameScreen" className="flex-row justify-center align-center screen hidden">
    <div className="grid-12">
      <TopRail />
      <div className="col-span-9 map-area">
        <MapGrid boardId="playerBoard" label="Player Board" showCellCoords />
      </div>
      <div className="col-span-3">
        <RightRail mode="game" />
      </div>
    </div>
  </section>
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
      <div className="crt-overlay"></div>
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
        </>
      )}
    </div>
  );
}

const rootElement = document.getElementById('root');
const root = ReactDOM.createRoot(rootElement);
root.render(<AppShell />);

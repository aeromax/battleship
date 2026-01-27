const HomeScreen = () => (
  <section id="homeScreen" className="flex-row justify-center align-center screen home hidden">
    <div className="panel flex-column flex-between flex-gap-md justify-center align-center">
      <div className="panel-logo">
        <h1>GRID OPS</h1>
      </div>
      <div className="flex-column action-area">
        <div className="flex-row action-area--track">
          <div className="flex-row justify-center flex-gap-md action-area--panel action-area--buttons">
            <button id="newGameBtn" className="button primary large">
              <span class="material-symbols-outlined">
                military_tech
              </span> NEW DEPLOYMENT
            </button>
            {/* <button id="loadLocalSaveBtn" className="button primary large disabled">
              <span class="material-symbols-outlined">
                save
              </span> RESUME SAVED OP
            </button> */}
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
                <span class="material-symbols-outlined">
                  arrow_back
                </span>
              </button>
              <button id="startDeploymentBtn" className="col-span-10 button primary ">
                continue
              </button>
            </div>
          </div>
          <div className="grid-12 action-area--panel action-area--game-mode">
            <button id="cancelModeBtn" className="col-span-2 button secondary ">
              <span class="material-symbols-outlined">
                arrow_back
              </span>
            </button>
            <button id="startSoloBtn" className="col-span-5 button primary " data-mode="solo">
              Human vs. <br /> Computer
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
            <span class="material-symbols-outlined">arrow_back</span>
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

const MapGrid = ({ boardId }) => (
  <div className="map-shell">
    <div className="axis axis-top">
      {AXIS_LETTERS.map((letter) => (
        <span key={letter}>{letter}</span>
      ))}
    </div>
    <div className="axis axis-side">
      {AXIS_NUMBERS.map((number) => (
        <span key={number}>{number}</span>
      ))}
    </div>
    <div className="board-shell">
      <div id={boardId} className="grid board board-primary">
        {GRID_COORDINATES.map((coord) => (
          <div
            key={coord}
            className="cell"
            data-coord={coord}
            aria-label={`Empty sector ${coord}`}
          />
        ))}
      </div>
    </div>
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
    </div>
  </div>
);

const AttackBoardPanel = () => (
  <div id="attack-board" className="panel attack-board-panel flex-column flex-between flex-gap-md">
    <MapGrid boardId="attackBoard" />
    <button id="fireBtn" className="large align-stretch red disabled" disabled>
      Fire!
    </button>
  </div>
);

const SetupScreen = () => (
  <section id="setupScreen" className="flex-row justify-center align-center screen hidden">
    <div className="grid-12">
      <div className="col-span-12 top-rail">
        <img className="command-logo" src="/assets/img/gridops_logo_h.png" alt="GridOps logo" />
      </div>
      <div className="col-span-8 map-area">
        <MapGrid boardId="placementBoard" label="Deployment Grid" />
      </div>
      <div className="col-span-4 flex-column flex-between flex-gap-md right-rail">
        <div className="panel vehicles-panel flex-column flex-around align-center flex-gap-md">
          <div id="unitList" className="unit-list flex-column align-stretch flex-gap-sm"></div>
          <div className="orientation-toggle flex-row flex-between align-stretch  align-center">
            <div class="panel--head"><span>Orientation</span></div>
            <div className="flex flex-around flex-gap-sm">
              <button data-orientation="horizontal" className="button small secondary selected">
                <span class="material-symbols-outlined">width</span>
              </button>
              <button data-orientation="vertical" className="button small secondary">
                <span class="material-symbols-outlined">height</span>
              </button>
            </div>
          </div>
          <div className="panel--divider"></div>
          <div className="flex-row flex-between flex-gap-sm">
            <button id="randomizeBtn" className="button">
              Random Layout
            </button>
            <button id="clearBoardBtn" className="button">
              Reset Layout
            </button>
          </div>
        </div>
        <button id="readyBtn" className="primary red disabled" disabled>
          Deploy!
        </button>
      </div>
    </div>
  </section>
);
const GameScreen = () => (
  <section id="gameScreen" className="flex-row justify-center align-center screen hidden">
    <div className="grid-12">
      <div className="col-span-12 top-rail flex-row flex-between flex-gap-md justify-start">
        <img className="command-logo" src="/assets/img/gridops_logo_h.png" alt="GridOps logo" />
        <button id="save-campaign" class="button small disabled">Save</button>
        <button id="abort-campaign" class="button small">Abort</button>
      </div>
      <div className="col-span-8 map-area">
        <MapGrid boardId="playerBoard" label="Player Board" />
      </div>
      <div className="col-span-4 flex-column flex-between flex-gap-md right-rail">
        <AttackBoardPanel />
        <div className="panel status-panel flex-grow flex-column flex-gap-sm">
          <div id="statusFeed" className="status-feed"></div>
        </div>
      </div>
    </div>
  </section>
);





function AppShell() {
  React.useEffect(() => {
    if (typeof window !== 'undefined' && window.GridOps && typeof window.GridOps.initializeApp === 'function') {
      window.GridOps.initializeApp();
    } else {
      console.error('GridOps initializeApp unavailable.');
    }
  }, []);

  return (
    <div id="app" className="app">
      <div className="crt-overlay"></div>
      <OverlayBanner />
      <main className="screens flex justify-center align-center">
        <HomeScreen />
        <PvpScreen />
        <SetupScreen />
        <GameScreen />

      </main>
      <MatchRequestDialog />
      <MatchConnectingDialog />
      <WaitingForOpponentDialog />
    </div>
  );
}

const rootElement = document.getElementById('root');
const root = ReactDOM.createRoot(rootElement);
root.render(<AppShell />);

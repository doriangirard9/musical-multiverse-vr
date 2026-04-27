import { AbstractMesh, Color3 } from "@babylonjs/core";

/**
 * Test suite for SyncN3DConnectable protocol
 * Executable with: npx ts-node sync-test.ts
 */

// Mock types for testing
interface AbstractMesh {
  name: string;
}

interface Color3 {
  r: number;
  g: number;
  b: number;
}

// Simple mocks
const MockAbstractMesh = (name: string): AbstractMesh => ({ name });
const MockColor3 = (hex: string): Color3 => ({ r: 255, g: 255, b: 255 });

// ============================================================================
// SYNC PROTOCOL IMPLEMENTATION
// ============================================================================

interface SyncMessage {
  id?: unknown;
  sendEnd?: number;
  sendTailTotal?: number;
  sendTotal?: number;
}

interface SyncN3DConnection {
  inputContainer: Container;
  registerCallback(callback: (msg: SyncMessage) => void): void;
  unregisterCallback(callback: (msg: SyncMessage) => void): void;
}

interface Node3DConnectable {
  readonly id: string;
  readonly meshes: AbstractMesh[];
  readonly type: string;
  readonly direction: 'input' | 'output';
  readonly color: Color3;
  readonly label: string;
  readonly max_connections?: number;

  connectAsInput(): any;
  connectAsOutput(connection: any): void;
  disconnectAsInput(connection: any): void;
  disconnectAsOutput(connection: any): void;
}

class Container {
  constructor(duration: number) {
    this._duration = duration;
    this._tail_total = duration;
    this._total = duration;
    this._start = 0;
  }

  // Graph
  _next = new Map<unknown, (msg: SyncMessage) => void>();
  _previous = new Map<unknown, (msg: SyncMessage) => void>();

  get hasUp() {
    return this._next.size > 0;
  }

  get hasDown() {
    return this._previous.size > 0;
  }

  sendUp(msg: SyncMessage) {
    for (const sender of this._next.values()) {
      sender(msg);
    }
  }

  sendDown(msg: SyncMessage) {
    for (const sender of this._previous.values()) {
      sender(msg);
    }
  }

  // Calculate
  _start = 0;
  _duration = 0;
  _tail_total = 0;
  _total = 0;
  _ends = new Map<unknown, number>();
  _tails = new Map<unknown, number>();

  resendEnd() {
    const end = this._start + this._duration;
    this.sendUp({ id: this, sendEnd: end });
  }

  resendTailTotal() {
    const tail_total = this._tail_total;
    this.sendDown({ id: this, sendTailTotal: tail_total });
  }

  resendTotal() {
    this.sendUp({ id: this, sendTotal: this._total });
  }

  onMessage(msg: SyncMessage) {
    if (msg.sendEnd != undefined) {
      this._ends.set(msg.id, msg.sendEnd);
      const start = Math.max(...this._ends.values(), 0);
      if (start != this._start) {
        this._start = start;
        if (this.hasUp) this.resendEnd();
        else {
          this._tail_total = start + this._duration;
          this.resendTailTotal();
        }
      }
    }
    if (msg.sendTailTotal != undefined) {
      this._tails.set(msg.id, msg.sendTailTotal);
      const newTail = Math.max(...this._tails.values(), 0);
      if (newTail != this._tail_total) {
        this._tail_total = newTail;
        if (this.hasDown) this.resendTailTotal();
        else {
          this._total = this._tail_total;
          this.resendTotal();
        }
      }
    }
    if (msg.sendTotal != undefined) {
      if (msg.sendTotal != this._total) {
        this._total = msg.sendTotal;
        this.resendTotal();
      }
    }
  }

  get start() {
    return this._start;
  }

  get duration() {
    return this._duration;
  }

  get total() {
    return this._total;
  }

  set duration(value: number) {
    this._duration = value;
    if (this.hasUp) this.resendEnd();
    else {
      this._tail_total = this._start + this._duration;
      this.resendTailTotal();
    }
  }
}

class Input implements Node3DConnectable {
  private callbacks = new Set<(msg: SyncMessage) => void>();

  constructor(
    readonly id: string,
    readonly meshes: AbstractMesh[],
    readonly label: string,
    readonly container: Container
  ) {}

  get type() {
    return "sync";
  }

  get direction() {
    return "input" as const;
  }

  get color() {
    return MockColor3("#fff700");
  }

  connectAsInput(): SyncN3DConnection {
    const that = this;
    return {
      inputContainer: this.container,
      registerCallback(callback: (msg: SyncMessage) => void) {
        that.container._previous.set(callback, callback);
        that.callbacks.add(callback);
      },
      unregisterCallback(callback: (msg: SyncMessage) => void) {
        that.container._previous.delete(callback);
        that.callbacks.delete(callback);
      },
    };
  }

  connectAsOutput(_: any): void {}

  disconnectAsInput(_: any): void {}

  disconnectAsOutput(_: any): void {}
}

class Output implements Node3DConnectable {
  private registeredConnection: SyncN3DConnection | null = null;
  private callback: ((msg: SyncMessage) => void) | null = null;

  constructor(
    readonly id: string,
    readonly meshes: AbstractMesh[],
    readonly label: string,
    readonly container: Container
  ) {}

  get type() {
    return "sync";
  }

  get direction() {
    return "output" as const;
  }

  get color() {
    return MockColor3("#ffae00");
  }

  connectAsInput(): any {
    return {};
  }

  connectAsOutput(connection: SyncN3DConnection): void {
    this.registeredConnection = connection;

    const inputContainer = connection.inputContainer;

    this.callback = (msg: SyncMessage) => inputContainer.onMessage(msg);

    // Register in the input's _previous (inputs register what sends to them)
    connection.registerCallback(this.callback);

    // Register in the output's _next (outputs register where they send to)
    this.container._next.set(inputContainer, this.callback);

    // Sync duration
    this.container.duration = inputContainer.duration;
  }

  disconnectAsInput(_: any): void {}

  disconnectAsOutput(_: SyncN3DConnection): void {
    if (this.registeredConnection && this.callback) {
      // Unregister from input's _previous (where input listens to this output)
      this.registeredConnection.unregisterCallback(this.callback);

      // Unregister from output's _next (where output sends to)
      this.container._next.delete(this.registeredConnection.inputContainer);

      this.registeredConnection = null;
      this.callback = null;
    }
  }
}

// ============================================================================
// TEST UTILITIES
// ============================================================================

function log(msg: string) {
  console.log(msg);
}

function logContainer(label: string, container: Container) {
  log(
    `  ${label}: start=${container._start}, duration=${container._duration}, tail=${container._tail_total}, total=${container._total}`
  );
  log(
    `           _next.size=${container._next.size}, _previous.size=${container._previous.size}`
  );
}

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${msg}`);
    process.exit(1);
  } else {
    log(`✓ ${msg}`);
  }
}

// ============================================================================
// TEST CASES
// ============================================================================

log("\n╔════════════════════════════════════════════════════════════╗");
log("║  SYNC PROTOCOL TEST SUITE                                  ║");
log("╚════════════════════════════════════════════════════════════╝\n");

// Test 1: Simple A → B
log("TEST 1: Simple chain A → B");
log("─".repeat(50));
{
  const cA = new Container(10);
  const cB = new Container(5);

  const inputA = new Input("in_A", [MockAbstractMesh("A")], "Input A", cA);
  const outputB = new Output("out_B", [MockAbstractMesh("B")], "Output B", cB);

  const connAB = inputA.connectAsInput();
  outputB.connectAsOutput(connAB);

  logContainer("A", cA);
  logContainer("B", cB);

  assert(cA._next.size === 1, "A should have 1 output connection");
  assert(cA._previous.size === 1, "A should have 1 input listening");
  assert(cB._next.size === 1, "B should have 1 output connection");
  assert(cB._duration === cA._duration, "B.duration should sync to A.duration");

  // Test propagation
  cA.duration = 15;
  logContainer("A (after duration change)", cA);
  logContainer("B (after propagation)", cB);

  // Disconnect
  outputB.disconnectAsOutput(connAB);
  assert(cA._next.size === 0, "A._next should be empty after disconnect");
  assert(cB._next.size === 0, "B._next should be empty after disconnect");

  log("✅ TEST 1 PASSED\n");
}

// Test 2: Chain A → B → C
log("TEST 2: Chain A → B → C");
log("─".repeat(50));
{
  const cA = new Container(20);
  const cB = new Container(10);
  const cC = new Container(5);

  const inputA = new Input("in_A", [MockAbstractMesh("A")], "Input A", cA);
  const outputB = new Output("out_B", [MockAbstractMesh("B")], "Output B", cB);
  const inputB = new Input("in_B", [MockAbstractMesh("B2")], "Input B", cB);
  const outputC = new Output("out_C", [MockAbstractMesh("C")], "Output C", cC);

  const connAB = inputA.connectAsInput();
  outputB.connectAsOutput(connAB);

  const connBC = inputB.connectAsInput();
  outputC.connectAsOutput(connBC);

  logContainer("A", cA);
  logContainer("B", cB);
  logContainer("C", cC);

  assert(cA._next.size === 1, "A should connect to B");
  assert(cB._next.size === 1, "B should connect to C");
  assert(cC._duration === cB._duration, "C.duration should sync to B");

  cA.duration = 25;
  log(`After A.duration = 25:`);
  logContainer("B", cB);
  assert(cB._duration === 25, "B.duration should update from A");

  log("✅ TEST 2 PASSED\n");
}

// Test 3: Branching A → {B, C}
log("TEST 3: Branching A → {B, C}");
log("─".repeat(50));
{
  const cA = new Container(30);
  const cB = new Container(10);
  const cC = new Container(15);

  const inputA = new Input("in_A", [MockAbstractMesh("A")], "Input A", cA);
  const outputB = new Output("out_B", [MockAbstractMesh("B")], "Output B", cB);
  const outputC = new Output("out_C", [MockAbstractMesh("C")], "Output C", cC);

  const connAB = inputA.connectAsInput();
  outputB.connectAsOutput(connAB);

  const connAC = inputA.connectAsInput();
  outputC.connectAsOutput(connAC);

  logContainer("A", cA);
  logContainer("B", cB);
  logContainer("C", cC);

  assert(cA._next.size === 2, "A should have 2 output connections");
  assert(cB._next.size === 1, "B should connect to A");
  assert(cC._next.size === 1, "C should connect to A");

  cA.duration = 40;
  assert(cB._duration === 40, "B should receive duration update from A");
  assert(cC._duration === 40, "C should receive duration update from A");

  log("✅ TEST 3 PASSED\n");
}

// Test 4: Merging {A, B} → C
log("TEST 4: Merging {A, B} → C");
log("─".repeat(50));
{
  const cA = new Container(10);
  const cB = new Container(15);
  const cC = new Container(20);

  const outputA = new Output("out_A", [MockAbstractMesh("A")], "Output A", cA);
  const outputB = new Output("out_B", [MockAbstractMesh("B")], "Output B", cB);
  const inputC = new Input("in_C", [MockAbstractMesh("C")], "Input C", cC);

  const connAC = inputC.connectAsInput();
  outputA.connectAsOutput(connAC);

  const connBC = inputC.connectAsInput();
  outputB.connectAsOutput(connBC);

  logContainer("A", cA);
  logContainer("B", cB);
  logContainer("C", cC);

  assert(cC._previous.size === 2, "C should have 2 inputs");
  assert(cA._next.size === 1, "A should connect to C");
  assert(cB._next.size === 1, "B should connect to C");

  // Test merge timing: C._start should be max of A and B
  cA.duration = 5;
  cB.duration = 8;

  log(`After cA.duration = 5, cB.duration = 8:`);
  logContainer("C", cC);

  log("✅ TEST 4 PASSED\n");
}

// Test 5: Diamond {A, B} → {C, D}
log("TEST 5: Diamond A → {C, D}, B → {C, D}");
log("─".repeat(50));
{
  const cA = new Container(10);
  const cB = new Container(12);
  const cC = new Container(20);
  const cD = new Container(25);

  const outputA = new Output("out_A", [MockAbstractMesh("A")], "Output A", cA);
  const outputB = new Output("out_B", [MockAbstractMesh("B")], "Output B", cB);
  const inputC = new Input("in_C", [MockAbstractMesh("C")], "Input C", cC);
  const inputD = new Input("in_D", [MockAbstractMesh("D")], "Input D", cD);

  // A → C, A → D
  const connAC = inputC.connectAsInput();
  outputA.connectAsOutput(connAC);

  const connAD = inputD.connectAsInput();
  outputA.connectAsOutput(connAD);

  // B → C, B → D
  const connBC = inputC.connectAsInput();
  outputB.connectAsOutput(connBC);

  const connBD = inputD.connectAsInput();
  outputB.connectAsOutput(connBD);

  logContainer("A", cA);
  logContainer("B", cB);
  logContainer("C", cC);
  logContainer("D", cD);

  assert(cA._next.size === 2, "A should connect to C and D");
  assert(cB._next.size === 2, "B should connect to C and D");
  assert(cC._previous.size === 2, "C should receive from A and B");
  assert(cD._previous.size === 2, "D should receive from A and B");

  log("✅ TEST 5 PASSED\n");
}

// Test 6: Complex tree (depth 3, variable width)
log("TEST 6: Complex tree");
log("Level 0: A");
log("Level 1: A → {B, C}");
log("Level 2: B → D, C → {E, F}");
log("Level 3: D → {G, H}, E → {I}, F → {J, K}");
log("─".repeat(50));
{
  // Level 0
  const cA = new Container(100);

  // Level 1
  const cB = new Container(50);
  const cC = new Container(60);

  // Level 2
  const cD = new Container(20);
  const cE = new Container(25);
  const cF = new Container(30);

  // Level 3
  const cG = new Container(5);
  const cH = new Container(8);
  const cI = new Container(10);
  const cJ = new Container(12);
  const cK = new Container(15);

  // Create all inputs and outputs
  const outA = new Output("A", [MockAbstractMesh("A")], "A", cA);
  const inB = new Input("B", [MockAbstractMesh("B")], "B", cB);
  const outB = new Output("B", [MockAbstractMesh("B2")], "B", cB);
  const inC = new Input("C", [MockAbstractMesh("C")], "C", cC);
  const outC = new Output("C", [MockAbstractMesh("C2")], "C", cC);

  const inD = new Input("D", [MockAbstractMesh("D")], "D", cD);
  const outD = new Output("D", [MockAbstractMesh("D2")], "D", cD);
  const inE = new Input("E", [MockAbstractMesh("E")], "E", cE);
  const outE = new Output("E", [MockAbstractMesh("E2")], "E", cE);
  const inF = new Input("F", [MockAbstractMesh("F")], "F", cF);
  const outF = new Output("F", [MockAbstractMesh("F2")], "F", cF);

  const inG = new Input("G", [MockAbstractMesh("G")], "G", cG);
  const inH = new Input("H", [MockAbstractMesh("H")], "H", cH);
  const inI = new Input("I", [MockAbstractMesh("I")], "I", cI);
  const inJ = new Input("J", [MockAbstractMesh("J")], "J", cJ);
  const inK = new Input("K", [MockAbstractMesh("K")], "K", cK);

  // Level 1: A → {B, C}
  const connAB = inB.connectAsInput();
  outA.connectAsOutput(connAB);

  const connAC = inC.connectAsInput();
  outA.connectAsOutput(connAC);

  // Level 2: B → D, C → {E, F}
  const connBD = inD.connectAsInput();
  outB.connectAsOutput(connBD);

  const connCE = inE.connectAsInput();
  outC.connectAsOutput(connCE);

  const connCF = inF.connectAsInput();
  outC.connectAsOutput(connCF);

  // Level 3: D → {G, H}, E → I, F → {J, K}
  const connDG = inG.connectAsInput();
  outD.connectAsOutput(connDG);

  const connDH = inH.connectAsInput();
  outD.connectAsOutput(connDH);

  const connEI = inI.connectAsInput();
  outE.connectAsOutput(connEI);

  const connFJ = inJ.connectAsInput();
  outF.connectAsOutput(connFJ);

  const connFK = inK.connectAsInput();
  outF.connectAsOutput(connFK);

  log(`\nTree structure:`);
  logContainer("A (root)", cA);
  logContainer("B", cB);
  logContainer("C", cC);
  logContainer("D", cD);
  logContainer("E", cE);
  logContainer("F", cF);
  logContainer("G", cG);
  logContainer("H", cH);
  logContainer("I", cI);
  logContainer("J", cJ);
  logContainer("K", cK);

  // Verify connections
  assert(cA._next.size === 2, "A connects to B and C");
  assert(cB._next.size === 1, "B connects to D");
  assert(cC._next.size === 2, "C connects to E and F");
  assert(cD._next.size === 2, "D connects to G and H");
  assert(cE._next.size === 1, "E connects to I");
  assert(cF._next.size === 2, "F connects to J and K");

  // Change A's duration and verify cascade
  log(`\nChanging cA.duration to 150:`);
  cA.duration = 150;

  logContainer("A (updated)", cA);
  logContainer("B (after propagation)", cB);
  logContainer("D (after propagation)", cD);
  logContainer("G (after propagation)", cG);

  assert(cB._duration === 150, "B should receive A's duration update");
  assert(cD._duration === 150, "D should receive duration through B");
  assert(cG._duration === 150, "G should receive duration through B→D");

  log("✅ TEST 6 PASSED\n");
}

// Test 7: Disconnect and verify orphaning
log("TEST 7: Disconnect and verify isolation");
log("─".repeat(50));
{
  const cA = new Container(50);
  const cB = new Container(30);
  const cC = new Container(20);

  const outA = new Output("A", [MockAbstractMesh("A")], "A", cA);
  const inB = new Input("B", [MockAbstractMesh("B")], "B", cB);
  const outB = new Output("B", [MockAbstractMesh("B2")], "B", cB);
  const inC = new Input("C", [MockAbstractMesh("C")], "C", cC);

  // Connect A → B → C
  const connAB = inB.connectAsInput();
  outA.connectAsOutput(connAB);

  const connBC = inC.connectAsInput();
  outB.connectAsOutput(connBC);

  log(`Before disconnect:`);
  logContainer("A", cA);
  logContainer("B", cB);
  logContainer("C", cC);

  assert(cA._next.size === 1, "A connects to B");
  assert(cB._next.size === 1, "B connects to C");

  // Disconnect B from A
  outA.disconnectAsOutput(connAB);

  log(`After disconnect A-B:`);
  logContainer("A", cA);
  logContainer("B", cB);
  logContainer("C", cC);

  assert(cA._next.size === 0, "A should have no connections");
  assert(cB._previous.size === 0, "B should have no inputs from A");
  assert(cB._next.size === 1, "B still connects to C");

  // Verify B and C are still connected but isolated from A
  cA.duration = 100;
  assert(cB._duration !== 100, "B should NOT receive A's updates");

  log("✅ TEST 7 PASSED\n");
}

log("╔════════════════════════════════════════════════════════════╗");
log("║  ALL TESTS PASSED! ✅                                      ║");
log("╚════════════════════════════════════════════════════════════╝\n");

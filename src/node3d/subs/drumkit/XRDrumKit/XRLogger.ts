import { AdvancedDynamicTexture, TextBlock, Rectangle } from "@babylonjs/gui";
import { Mesh, TransformNode, Vector3, Quaternion, WebXRDefaultExperience, Scene } from "@babylonjs/core";

class XRLogger {
    xrUI: AdvancedDynamicTexture;
    consoleText: TextBlock;
    controllerPositionText: TextBlock; // New text block for controller positions
    controllerVelocityText: TextBlock; // New text block for controller velocity
    private controllerPositions: { [handedness: string]: string } = {}; // Store positions for both controllers
    private drumsticks: { [stickId: string]: string } = {}; // Store positions for both controllers

    constructor(xr: WebXRDefaultExperience, scene: Scene) {
        // Initialize XR console
        this.xrUI = AdvancedDynamicTexture.CreateFullscreenUI("UI");

        // Center section for controller positions
        const controllerPositionContainer = new Rectangle();
        controllerPositionContainer.width = "40%"; 
        controllerPositionContainer.height = "35%"; // Increase height
        controllerPositionContainer.background = "rgba(0, 0, 0, 0.5)";
        controllerPositionContainer.color = "white";
        controllerPositionContainer.thickness = 0;
        controllerPositionContainer.verticalAlignment = TextBlock.VERTICAL_ALIGNMENT_TOP;
        controllerPositionContainer.horizontalAlignment = TextBlock.HORIZONTAL_ALIGNMENT_CENTER; // Move to the left
        controllerPositionContainer.isVisible = false; // Initially hidden
        this.xrUI.addControl(controllerPositionContainer);

        this.controllerVelocityText = new TextBlock();
        this.controllerVelocityText.color = "white";
        this.controllerVelocityText.fontSize = 18;
        this.controllerVelocityText.textWrapping = true;
        this.controllerVelocityText.resizeToFit = false; // Disable resizing to fit the text
        this.controllerVelocityText.textHorizontalAlignment = TextBlock.HORIZONTAL_ALIGNMENT_LEFT; // Align text to the left
        this.controllerVelocityText.textVerticalAlignment = TextBlock.VERTICAL_ALIGNMENT_TOP; // Align text to the top
        this.controllerVelocityText.clipChildren = true; // Ensure text is clipped to the container
        this.controllerVelocityText.clipContent = true; // Clip overflowing content
        this.controllerVelocityText.top = "200px"; // Position below the position text
        controllerPositionContainer.addControl(this.controllerVelocityText);

        this.controllerPositionText = new TextBlock();
        this.controllerPositionText.color = "white";
        this.controllerPositionText.fontSize = 18;
        this.controllerPositionText.textWrapping = true;
        this.controllerPositionText.resizeToFit = false; // Disable resizing to fit the text
        this.controllerPositionText.textHorizontalAlignment = TextBlock.HORIZONTAL_ALIGNMENT_LEFT; // Align text to the left
        this.controllerPositionText.textVerticalAlignment = TextBlock.VERTICAL_ALIGNMENT_TOP; // Align text to the top
        controllerPositionContainer.addControl(this.controllerPositionText);

        // Center section for general console messages
        const consoleContainer = new Rectangle();
        consoleContainer.width = "40%"; 
        consoleContainer.height = "50%"; // Increase height
        consoleContainer.background = "rgba(0, 0, 0, 0.5)";
        consoleContainer.color = "white";
        consoleContainer.thickness = 0;
        consoleContainer.verticalAlignment = TextBlock.VERTICAL_ALIGNMENT_TOP;
        consoleContainer.horizontalAlignment = TextBlock.HORIZONTAL_ALIGNMENT_CENTER; // Move to the left
        consoleContainer.top = "40%"; // Slightly below the controller position container
        consoleContainer.isVisible = false; // Initially hidden
        this.xrUI.addControl(consoleContainer);

        this.consoleText = new TextBlock();
        this.consoleText.color = "white";
        this.consoleText.fontSize = 18;
        this.consoleText.textWrapping = true;
        this.consoleText.resizeToFit = false; // Disable resizing to fit the text
        this.consoleText.textHorizontalAlignment = TextBlock.HORIZONTAL_ALIGNMENT_LEFT; // Align text to the left
        this.consoleText.textVerticalAlignment = TextBlock.VERTICAL_ALIGNMENT_TOP; // Align text to the top
        this.consoleText.clipChildren = true; // Ensure text is clipped to the container
        this.consoleText.clipContent = true; // Clip overflowing content
        consoleContainer.addControl(this.consoleText);

        // Link the console parts to the XR headset
        const headsetNode = xr.baseExperience.camera.parent; // Get the headset's parent node
        const controllerPositionTransformNode = new TransformNode("controllerPositionTransformNode", scene);
        controllerPositionTransformNode.parent = headsetNode; // Attach to the headset
        controllerPositionTransformNode.position = new Vector3(0, 1.5, 1); // Position in front of the headset
        controllerPositionTransformNode.billboardMode = Mesh.BILLBOARDMODE_ALL; // Make it always face the camera
        controllerPositionContainer.linkWithMesh(controllerPositionTransformNode);

        const consoleTransformNode = new TransformNode("consoleTransformNode", scene);
        consoleTransformNode.parent = headsetNode; // Attach to the headset
        consoleTransformNode.position = new Vector3(0, 0.5, 1); // Position below the controller positions
        consoleTransformNode.billboardMode = Mesh.BILLBOARDMODE_ALL; // Make it always face the camera
        consoleContainer.linkWithMesh(consoleTransformNode);

        // Monitor the right controller's internal trigger
        xr.input.onControllerAddedObservable.add((controller) => {
            if (controller.inputSource.handedness === "right") {
                controller.onMotionControllerInitObservable.add((motionController) => {
                    const trigger = motionController.getComponent("xr-standard-squeeze");
                    trigger.onButtonStateChangedObservable.add((button) => {
                        const isPressed = button.pressed;

                        // Reposition the containers dynamically in front of the camera
                        const camera = xr.baseExperience.camera;
                        if (isPressed) {
                            const forward = camera.getForwardRay(1).direction; // Get the forward direction of the camera
                            const offset = new Vector3(forward.x, forward.y, forward.z).scale(1); // Scale to desired distance
                            const cameraPosition = camera.position;

                            controllerPositionTransformNode.position = cameraPosition.add(offset).add(new Vector3(0, 0.5, 0)); // Slightly above
                            consoleTransformNode.position = cameraPosition.add(offset).add(new Vector3(0, -0.5, 0)); // Slightly below
                        }

                        // Toggle visibility
                        controllerPositionContainer.isVisible = isPressed;
                        consoleContainer.isVisible = isPressed;
                    });
                });
            }
        });

        this.initializeXRLogger(); // Replace the old logging redirection with the new method
        }
        
            private initializeXRLogger() {
                const maxLines = 20;
                const maxLineLength = 100; // Maximum characters per line
                const logBuffer: string[] = [];
                const originalConsoleLog = console.log; // Preserve the original console.log
        
                console.log = (...args: any[]) => {
                    // Log to the browser console
                    originalConsoleLog(...args);
        
                    // Format and log to the XR UI console
                    const newText = args
                        .map(arg => {
                            if (typeof arg === "object") {
                                return arg ? ("Objet : " + arg.constructor.name) : "unnamed Object"; // Print object name or null
                            }
                            const str = String(arg);
                            return str.length > maxLineLength ? str.slice(0, maxLineLength) + "..." : str;
                        })
                        .join(" ");
                    
                    logBuffer.unshift(newText); // Add new log at the top
                    if (logBuffer.length > maxLines) {
                        logBuffer.pop(); // Remove the oldest log if buffer exceeds maxLines
                    }
        
                    this.consoleText.text = logBuffer.join("\n"); // Update the XR UI console
                };
            }
        
            updateControllerPositionText(text: string) {
                this.controllerPositionText.text = text;
            }
            updateControllerVelocityText(text: string) {
                this.controllerVelocityText.text = text;
            }
            updateControllerPositions(controllerPos: Vector3, controllerRot: Quaternion, handedness: string) {
                // Fixed-width formatting to prevent flickering
                const positionText = `Position (${handedness.padEnd(5)}): X:${controllerPos.x.toFixed(2).padStart(6)}, Y:${controllerPos.y.toFixed(2).padStart(6)}, Z:${controllerPos.z.toFixed(2).padStart(6)}`;
                const rotationText = `Rotation (${handedness.padEnd(5)}): X:${controllerRot.x.toFixed(2).padStart(6)}, Y:${controllerRot.y.toFixed(2).padStart(6)}, Z:${controllerRot.z.toFixed(2).padStart(6)}, W:${controllerRot.w.toFixed(2).padStart(6)}`;
                
                
                this.controllerPositions[handedness] = `${positionText}\n${rotationText}`;
                const combinedText = Object.values(this.controllerPositions).join("\n"); // Combine positions for both controllers
                this.updateControllerPositionText(combinedText);

            }
            updateControllerVelocity(linearVelocity: Vector3, angularVelocity : Vector3, stickId : string){
                // Fixed-width formatting to prevent flickering
                
                // Calculate lengths of the velocity vectors
                const linearLength = linearVelocity.length().toFixed(2).padStart(6);
                const angularLength = angularVelocity.length().toFixed(2).padStart(6);

                const velocityText = `Drumstick (${stickId}) Velocity:
Linear:  X:${linearVelocity.x.toFixed(2).padStart(6)}, Y:${linearVelocity.y.toFixed(2).padStart(6)}, Z:${linearVelocity.z.toFixed(2).padStart(6)}, Len:${linearLength}
Angular: X:${angularVelocity.x.toFixed(2).padStart(6)}, Y:${angularVelocity.y.toFixed(2).padStart(6)}, Z:${angularVelocity.z.toFixed(2).padStart(6)}, Len:${angularLength}`;

                // Update the velocity text in the XR console
                this.controllerVelocityText.text = velocityText;

                this.drumsticks[stickId] = velocityText
                const combinedText = Object.values(this.drumsticks).join("\n"); // Combine positions for both controllers
                this.updateControllerVelocityText(combinedText);
            }
}

export default XRLogger;
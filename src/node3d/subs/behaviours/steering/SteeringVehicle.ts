import { Vector3, TransformNode, Mesh } from "@babylonjs/core";
import { BehaviorManager } from "./BehaviorManager";

export class SteeringVehicle {
    public mesh: TransformNode | Mesh;
    public position: Vector3;
    public velocity: Vector3;
    public steeringForce: Vector3;

    public maxSpeed: number = 50.0;
    public maxForce: number = 200.0;
    public mass: number = 1.0;
    public slowingRadius: number = 32.0;
    
    public wanderAngle: number = -Math.PI / 2;
    public wanderDistance: number = 8.0;
    public wanderRadius: number = 1.0;
    public wanderJitter: number = 0.4;
    
    public perceptionRadius: number = 15.0;

    public behaviorManager: BehaviorManager;

    constructor(mesh: TransformNode | Mesh) {
        this.mesh = mesh;
        this.position = mesh.position;
        this.velocity = new Vector3(0.1, 0, 0.1);
        this.steeringForce = Vector3.Zero();

        this.behaviorManager = new BehaviorManager(this);
    }

    public update(dt: number): void {
        let acceleration = this.steeringForce.scale(1 / this.mass);
        this.velocity.addInPlace(acceleration.scale(dt));
        this.velocity = this.clampToMax(this.velocity, this.maxSpeed);

        // Move with collisions so it interacts with XR objects
        if (this.mesh instanceof Mesh) {
            let moveDelta = this.velocity.scale(dt);
            this.mesh.moveWithCollisions(moveDelta);
        } else {
            this.position.addInPlace(this.velocity.scale(dt));
        }

        this.steeringForce.setAll(0);

        if (this.velocity.lengthSquared() > 0.001) {
            let lookAtPos = this.position.add(this.velocity);
            this.mesh.lookAt(lookAtPos);
        }
    }

    public applyBehavior(behaviorType: string, targetObj: any): void {
        let force = Vector3.Zero();
        switch (behaviorType) {
            case "Arrive":
                force = this.arrive(targetObj.position);
                break;
            case "Seek":
                force = this.seek(targetObj.position);
                break;
        }
        this.steeringForce.addInPlace(force);
    }

    public applyComplexBehaviors(targetObj: any): void {
        let combinedForce = this.behaviorManager.calculate(targetObj);
        this.steeringForce.addInPlace(combinedForce);
    }

    public edges(groundWidth: number, groundHeight: number): void {
        const halfWidth = groundWidth / 2;
        const halfHeight = groundHeight / 2;

        if (this.position.x > halfWidth) { this.position.x = halfWidth; this.velocity.x *= -1; }
        else if (this.position.x < -halfWidth) { this.position.x = -halfWidth; this.velocity.x *= -1; }

        if (this.position.z > halfHeight) { this.position.z = halfHeight; this.velocity.z *= -1; }
        else if (this.position.z < -halfHeight) { this.position.z = -halfHeight; this.velocity.z *= -1; }

        if (this.position.y < 0.5) { this.position.y = 0.5; if (this.velocity.y < 0) this.velocity.y = 0; }
    }

    // --- STEERING MATH ---
    public seek(target: Vector3): Vector3 {
        let desired = target.subtract(this.position);
        desired.normalize().scaleInPlace(this.maxSpeed);
        return this.clampToMax(desired.subtract(this.velocity), this.maxForce);
    }

    public arrive(target: Vector3): Vector3 {
        let desired = target.subtract(this.position);
        let distance = desired.length();
        let m = this.maxSpeed;
        if (distance < this.slowingRadius) {
            m = this.map(distance, 0, this.slowingRadius, 0, this.maxSpeed);
        }
        desired.normalize().scaleInPlace(m);
        return this.clampToMax(desired.subtract(this.velocity), this.maxForce);
    }

    public wander(): Vector3 {
        let forward = this.velocity.lengthSquared() > 0.001 ? this.velocity.clone().normalizeToNew() : new Vector3(0, 0, 1);
        let pointDevant = this.position.add(forward.scale(this.wanderDistance));
        let heading = Math.atan2(this.velocity.z, this.velocity.x);
        let theta = this.wanderAngle + heading;
        let pointSurLeCercle = new Vector3(Math.cos(theta) * this.wanderRadius, 0, Math.sin(theta) * this.wanderRadius).add(pointDevant);
        this.wanderAngle += (Math.random() - 0.5) * 2 * this.wanderJitter;
        let force = pointSurLeCercle.subtract(this.position);
        return force.normalizeToNew().scale(this.maxForce);
    }

    // --- FLOCKING MATH ---
    public align(boids: SteeringVehicle[]): Vector3 {
        let steering = Vector3.Zero();
        let total = 0;
        for (let other of boids) {
            if (other !== this && Vector3.Distance(this.position, other.position) < this.perceptionRadius) {
                steering.addInPlace(other.velocity);
                total++;
            }
        }
        if (total > 0) {
            steering.scaleInPlace(1 / total);
            steering = steering.normalizeToNew().scale(this.maxSpeed);
            steering.subtractInPlace(this.velocity);
            return this.clampToMax(steering, this.maxForce);
        }
        return steering;
    }

    public cohesion(boids: SteeringVehicle[]): Vector3 {
        let steering = Vector3.Zero();
        let total = 0;
        for (let other of boids) {
            if (other !== this && Vector3.Distance(this.position, other.position) < this.perceptionRadius * 2) {
                steering.addInPlace(other.position);
                total++;
            }
        }
        if (total > 0) {
            steering.scaleInPlace(1 / total);
            steering.subtractInPlace(this.position);
            steering.normalize().scaleInPlace(this.maxSpeed);
            steering.subtractInPlace(this.velocity);
            return this.clampToMax(steering, this.maxForce);
        }
        return steering;
    }

    public separation(boids: SteeringVehicle[]): Vector3 {
        let steering = Vector3.Zero();
        let total = 0;
        for (let other of boids) {
            if (other !== this) {
                let d = Vector3.Distance(this.position, other.position);
                if (d < this.perceptionRadius && d > 0.001) {
                    let diff = this.position.subtract(other.position).normalize().scale(1 / d);
                    steering.addInPlace(diff);
                    total++;
                }
            }
        }
        if (total > 0) {
            steering.scaleInPlace(1 / total);
            steering = steering.normalizeToNew().scale(this.maxSpeed);
            steering.subtractInPlace(this.velocity);
            return this.clampToMax(steering, this.maxForce);
        }
        return steering;
    }

    public boundaries(x: number, y: number, width: number, height: number, distance: number): Vector3 {
        let desired = Vector3.Zero();
        if (this.position.x < x + distance) desired.x = this.maxSpeed;
        else if (this.position.x > x + width - distance) desired.x = -this.maxSpeed;

        if (this.position.z < y + distance) desired.z = this.maxSpeed;
        else if (this.position.z > y + height - distance) desired.z = -this.maxSpeed;

        if (desired.lengthSquared() > 0.0001) {
            desired.normalize().scaleInPlace(this.maxSpeed);
            let steer = desired.subtract(this.velocity);
            return this.clampToMax(steer, this.maxForce);
        }
        return Vector3.Zero();
    }

    public clampToMax(vector: Vector3, max: number): Vector3 {
        if (vector.lengthSquared() > max * max) {
            return vector.normalizeToNew().scale(max);
        }
        return vector;
    }

    private map(value: number, start1: number, stop1: number, start2: number, stop2: number): number {
        return ((value - start1) / (stop1 - start1)) * (stop2 - start2) + start2;
    }
}
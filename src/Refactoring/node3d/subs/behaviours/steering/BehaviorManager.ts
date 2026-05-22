import { Vector3 } from "@babylonjs/core";
import { SteeringVehicle } from "./SteeringVehicle";

export interface ActiveBehavior {
    type: string;
    weight: number;
}

export class BehaviorManager {
    public vehicle: SteeringVehicle;
    public activeBehaviors: ActiveBehavior[];

    public alignWeight: number = 1.0;
    public cohesionWeight: number = 1.0;
    public separationWeight: number = 1.25;
    public boundariesWeight: number = 1.0;

    constructor(vehicle: SteeringVehicle) {
        this.vehicle = vehicle;
        this.activeBehaviors = [];
    }

    public setBehaviorWeight(type: string, weight: number): void {
        let existing = this.activeBehaviors.find((b) => b.type === type);
        if (existing) {
            if (weight <= 0) {
                this.removeBehavior(type);
            } else {
                existing.weight = weight;
            }
        } else if (weight > 0) {
            this.activeBehaviors.push({ type, weight });
        }
    }

    public removeBehavior(type: string): void {
        this.activeBehaviors = this.activeBehaviors.filter((b) => b.type !== type);
    }

    public clear(): void {
        this.activeBehaviors = [];
    }

    public calculate(targetObj: any): Vector3 {
        let totalForce = Vector3.Zero();

        for (let b of this.activeBehaviors) {
            let force = Vector3.Zero();

            switch (b.type) {
                case "Arrive":
                    if (targetObj && targetObj.position) force = this.vehicle.arrive(targetObj.position);
                    break;
                case "Seek":
                    if (targetObj && targetObj.position) force = this.vehicle.seek(targetObj.position);
                    break;
                case "Wander":
                    force = this.vehicle.wander();
                    break;
                // Add the other cases (Flee, Pursue, Avoid) here as needed
            }

            force.scaleInPlace(b.weight);
            totalForce.addInPlace(force);
        }

        return this.vehicle.clampToMax(totalForce, this.vehicle.maxForce);
    }

    public flock(boids: SteeringVehicle[], boundaryConfig?: any): void {
        let alignment = this.vehicle.align(boids).scale(this.alignWeight);
        let cohesion = this.vehicle.cohesion(boids).scale(this.cohesionWeight);
        let separation = this.vehicle.separation(boids).scale(this.separationWeight);

        let boundaries = Vector3.Zero();
        if (boundaryConfig) {
            boundaries = this.vehicle.boundaries(
                boundaryConfig.x, boundaryConfig.y,
                boundaryConfig.width, boundaryConfig.height,
                boundaryConfig.distance
            ).scale(this.boundariesWeight);
        }

        let totalFlock = alignment.add(cohesion).add(separation).add(boundaries);
        this.vehicle.steeringForce.addInPlace(totalFlock);
    }
}
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, JoinColumn } from "typeorm";
import { User } from "./User";
import { Booking } from "./Booking";

export enum ServiceCategory {
  TUTORING = 'tutoring',
  REPAIR = 'repair',
  CLEANING = 'cleaning',
  GARDENING = 'gardening',
  TECH_SUPPORT = 'tech-support',
  PET_CARE = 'pet-care',
  DELIVERY = 'delivery',
  HANDYMAN = 'handyman',
  COOKING = 'cooking',
  FITNESS = 'fitness',
  OTHER = 'other'
}

export enum PriceType {
  HOURLY = 'hourly',
  FIXED = 'fixed',
  DAILY = 'daily'
}

@Entity()
export class Service {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  providerId: string;

  @ManyToOne(() => User, user => user.services)
  @JoinColumn({ name: "providerId" })
  provider: User;

  @Column()
  title: string;

  @Column("text")
  description: string;

  @Column({
    type: "simple-enum",
    enum: ServiceCategory
  })
  category: ServiceCategory;

  @Column("decimal", { precision: 10, scale: 2 })
  price: number;

  @Column({
    type: "simple-enum",
    enum: PriceType
  })
  priceType: PriceType;

  @Column("simple-json")
  availability: string[];

  @Column()
  location: string;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => Booking, booking => booking.service)
  bookings: Booking[];
}

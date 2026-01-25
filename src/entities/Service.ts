import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, JoinColumn, Index } from "typeorm";
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

export enum ApprovalStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected'
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
  location: string; // neighbourhood from reverse geocoding

  @Column({ nullable: true, type: 'varchar' })
  city: string | null; // city name from reverse geocoding

  @Column({ default: true })
  isActive: boolean;

  // Geospatial fields
  @Column('decimal', { precision: 10, scale: 7 })
  latitude: number;

  @Column('decimal', { precision: 10, scale: 7 })
  longitude: number;

  @Column({ nullable: true })
  @Index()
  h3Index: string;

  @Column('simple-json', { default: '[]' })
  images: string[];

  @Column({ type: 'enum', enum: ApprovalStatus, default: ApprovalStatus.APPROVED })
  @Index()
  approvalStatus: ApprovalStatus;

  @Column({ nullable: true, type: 'varchar' })
  approvedBy: string | null;

  @Column({ nullable: true, type: 'timestamp' })
  approvedAt: Date | null;

  @Column({ default: 0 })
  views: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => Booking, booking => booking.service)
  bookings: Booking[];
}

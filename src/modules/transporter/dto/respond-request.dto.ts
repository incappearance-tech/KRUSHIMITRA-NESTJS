import { IsString, IsOptional, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RespondRequestDto {
  @ApiProperty({
    description: 'Action to take',
    enum: ['accept', 'reject', 'suggest'],
  })
  @IsString()
  @IsIn(['accept', 'reject', 'suggest'])
  action: 'accept' | 'reject' | 'suggest';

  @ApiPropertyOptional({
    description:
      'Suggested alternate date (ISO string), required when action = suggest',
  })
  @IsString()
  @IsOptional()
  suggestedDate?: string;
}

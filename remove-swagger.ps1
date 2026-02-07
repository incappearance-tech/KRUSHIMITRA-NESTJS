# Remove Swagger decorators from all files
$files = @(
    'src\modules\auth\dto\auth.dto.ts',
    'src\modules\labour\labour.controller.ts',
    'src\modules\machines\dto\machine.dto.ts',
    'src\modules\machines\machines.controller.ts',
    'src\modules\transporter\dto\create-trip.dto.ts',
    'src\modules\transporter\transporter.controller.ts'
)

foreach ($file in $files) {
    if (Test-Path $file) {
        Write-Host "Cleaning $file..."
        $content = Get-Content $file -Raw
        
        # Remove Swagger import line
        $content = $content -replace "import.*'@nestjs/swagger';\r?\n", ""
        
        # Remove decorators (line by line)
        $content = $content -replace "\s*@ApiTags\([^\)]+\)\r?\n", ""
        $content = $content -replace "\s*@ApiOperation\(\{[^\}]+\}\)\r?\n", ""
        $content = $content -replace "\s*@ApiProperty[^(]*\(\{[^\}]+\}\)\r?\n", ""
        $content = $content -replace "\s*@ApiProperty[^(]*\(\)\r?\n", ""
        $content = $content -replace "\s*@ApiResponse\([^\)]+\)\r?\n", ""
        $content = $content -replace "\s*@ApiBearerAuth\(\)\r?\n", ""
        
        Set-Content -Path $file -Value $content -NoNewline
        Write-Host "  ✓ Done"
    }
}

Write-Host "`nAll files cleaned!"
